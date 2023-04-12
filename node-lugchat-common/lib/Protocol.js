import { sign } from './Utils.js';

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
 * @property {string} ip
 * @property {ConnectionStatus} connStatus
 * @property {UserStatus} userStatus
 */

/**
 * @typedef {Object} BaseMessage
 * @property {MessageType} type
 * @property {number} time
 * @property {any} content
 */

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
 */

/**
 * @typedef {Object} PostMessage
 * @property {string} postContent
 */

/** all transmitted messages are wrapped in this
 * @typedef {Object} MessageWrapper
 * @property {BaseMessage} message message that was transmitted
 * @property {string} sig Base64?
 */

/**
 * @typedef {Object} ServerMessageType
 * @property {MessageType} responseTo what kind of message is the server replying to
 * @property {AccRej} response did server handle/retain the clients message
 * @property {ServerMessageReason} [reason] if server didnt, why?
 */

/** ServerMessage extends BaseMessage
 * @typedef {BaseMessage & ServerMessageType} ServerMessage
 */

/**
 * wraps the server message with the sig
 * @param {BaseMessage} m can be either a ServerMessage or ClientMessage
 * @param {string} signingKey pem key to sign the message with
 * @returns {MessageWrapper} wrapped message
 */
function wrapResponse(m, signingKey) {
  const sig = sign(signingKey, JSON.stringify(m));
  /** @type {MessageWrapper} */
  const mw = {
    message: m,
    sig,
  };
  return mw;
}

export {
  AccRej, ConnectionStatus, MessageType, ServerMessageReason, UserStatus, wrapResponse,
};
