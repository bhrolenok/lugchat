// @ts-check
import { md5, sign, verify } from './Utils.js';

/**
 * @enum {string}
 */
const MessageType = {
  hello: 'hello',
  subscribe: 'subscribe',
  users: 'users',
  post: 'post',
  history: 'history',
  reply: 'reply',
  disconnct: 'disconnect',
  response: 'response',
  unknown: 'unknown',
};

/**
 * @enum {string}
 */
const ServerMessageReason = {
  none: 'none',
  format: 'format',
  signature: 'signature',
  access: 'access',
  exception: 'exception',
};

/**
 * @enum {string}
 */
const AccRej = {
  accept: 'accept',
  reject: 'reject',
};

/**
 * @enum {string}
 */
const ConnectionStatus = {
  connected: 'connected',
  loggedIn: 'loggedIn',
  subscribed: 'subscribed',
  unsubscribed: 'unsubscribed',
  disconnected: 'disconnected',
};

/**
 * @enum {string}
 */
const UserStatus = {
  online: 'online',
  offline: 'offline',
};

/**
 * @typedef {Object} User
 * @property {string} nick
 * @property {string} publicKey
 * @property {string} ip best effort address we have for the user
 * @property {ConnectionStatus} connStatus
 * @property {UserStatus} userStatus
 * @property {boolean} timedOut if true the users ping failed to respond
 */

// * BASE MESSAGE EVERYTHING SENDS

/**
 * @typedef {Object} BaseMessage
 * @property {MessageType} type
 * @property {number} time
 * @property {any} content
 */

// * CLIENT MESSAGES

/**
 * @typedef {Object} ClientMessageType
 * @property {string} nick
 */

/**
 * @typedef {BaseMessage & ClientMessageType} ClientMessage
 */

/**
 * @typedef {Object} HelloMessage
 * @property {string} publicKey
 * @property {string} keyHash
 */

/**
 * @typedef {Object} SubscribeMessage
 * @property {string} publicKey clients public key
 * @property {number} lastClientTime can be clients last messsage time, or 0 if never
 */

/**
 * @typedef {Object} HistoryMessage
 * @property {number} start timestamp to start getting message from
 * @property {number} end timestamp to finish getting messages from
 */

/**
 * @typedef {Object} PostMessage
 * @property {string} postContent
 */

// * SERVER RESPONSES BELOW

/**
 * @typedef {Object} ServerMessageType
 * @property {MessageType} responseToType what kind of message is the server replying to
 * @property {string} origSig the signature of the message the server is responding to
 * @property {AccRej} response did server handle/retain the clients message
 * @property {ServerMessageReason} [reason] if server didnt, why?
 */

/** ServerMessage extends BaseMessage
 * @typedef {BaseMessage & ServerMessageType} ServerMessage
 */

/**
 * @typedef ServerSubscribeResponse
 * @property {number} oldestMessageTime oldest recorded message the server has
 * @property {number} latestMessageTime newest/latest message the server has seen
 */

/**
 * @typedef ServerHelloResponse
 * @property {string} serverKey public key of the server
 */

/**
 * @typedef ServerHistoryResponse
 * @property {MessageWrapper[]} msgList requested messages
 */

// * WRAPS ALL MESSAGES

/** all transmitted messages are wrapped in this
 * @typedef {Object} MessageWrapper
 * @property {ClientMessage | ServerMessage} message message that was transmitted
 * @property {string} sig Base64
 * @property {string} keyHash
 * @property {number} protocolVersion
 */

/**
 * wraps the server message with the sig
 * @param {ClientMessage | ServerMessage} m can be either a ServerMessage or ClientMessage
 * @param {string} signingKey pem key to sign the message with
 * @param {string} publicKey pem public key to hash
 * @returns {MessageWrapper} wrapped message
 */
function wrapResponse(m, signingKey, publicKey) {
  const sig = sign(signingKey, JSON.stringify(m));
  /** @type {MessageWrapper} */
  const mw = {
    message: m,
    sig,
    keyHash: md5(publicKey),
    protocolVersion: 1,
  };
  return mw;
}

/**
 * Verifies a given message with the public key
 * @param {MessageWrapper} mw message to verify
 * @param {string} publicKey key to verify with
 * @returns {boolean} if the message was legit
 */
function verifyMessage(mw, publicKey) {
  const msgStr = JSON.stringify(mw.message);
  return verify(publicKey, mw.sig, msgStr);
}

export {
  AccRej,
  ConnectionStatus,
  MessageType,
  ServerMessageReason,
  UserStatus,
  verifyMessage,
  wrapResponse,
};
