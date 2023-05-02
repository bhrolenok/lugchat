// @ts-check
import debug from 'debug';
import EventEmitter from 'events';
import { Utils, Protocol } from 'node-lugchat-common';

const {
  AccRej, ConnectionStatus, UserStatus, ServerMessageReason,
} = Protocol;
const log = debug('lugchat:nodeServer');

/** @typedef {import('ws').WebSocket} WebSocket */
/** @typedef {import('node-lugchat-common/lib/model').BaseDB} BaseDB */

/**
 * @emits UserSocket#messageReceived when a valid message from the client was handled
 * @emits UserSocket#disconnected when socket detects via ping/pong that the clients gone
 * @emits UserSocket#userUpdate when any change to the user is detected
 */
export default class UserSocket extends EventEmitter {
  /** @type {WebSocket} */
  #ws;

  /** @type {string} */
  #svrPvtKey;

  /** @type {string} */
  #svrPubKey;

  /** @type {Protocol.User} */
  user;

  /** @type {NodeJS.Timer} */
  #timer;

  /** @type {BaseDB} */
  #db;

  /**
   * Create a new object to handle the requests coming in from this user
   * @param {WebSocket} ws websocket that connected
   * @param {import('http').IncomingMessage} req figure out where this comes from
   * @param {string} svrPvtKey key for signing messages
   * @param {string} svrPubKey key for sending clients
   * @param {BaseDB} db database to use
   * @event UserSocket#disconnected
   */
  constructor(ws, req, svrPvtKey, svrPubKey, db) {
    super();
    this.#ws = ws;
    this.#svrPvtKey = svrPvtKey;
    this.#svrPubKey = svrPubKey;
    this.#db = db;

    // default take the remoteaddress, which could be a load balancer
    let ipAddr = req.socket.remoteAddress || '';

    // if forwarded header is set, lets take that instead
    const xForward = req.headers['x-forwarded-for'];
    if (Utils.isntNull(xForward)) {
      // coersion of possible string[] to string
      ipAddr = `${xForward}`.split(',')[0].trim();
    }

    this.user = {
      ip: ipAddr,
      userStatus: UserStatus.online,
      connStatus: ConnectionStatus.connected,
      timedOut: false,
      nick: '',
      publicKey: '',
    };

    log('new connection', this.user);

    // force binding this to the handlemethod since its called via eventing
    this.handleMessage = this.handleMessage.bind(this);

    ws.on('message', this.handleMessage);
    // special ws response used for keeping the connection open
    ws.on('pong', () => {
      this.user.timedOut = false;
    });
    // setup interval for requesting pong response every 30s
    this.#timer = setInterval(() => {
      if (this.user.timedOut) {
        this.user.userStatus = UserStatus.offline;
        this.user.connStatus = ConnectionStatus.disconnected;
        ws.terminate();
        clearInterval(this.#timer);
        this.emit('disconnected');
      }
      this.user.timedOut = true;
      ws.ping();
    }, 30 * 1000);

    ws.on('error', (err) => {
      log('socket failure', err);
    });
    ws.on('disconnect', () => {
      log('client disconnected');
    });
  }

  /**
   * Sends a message to the client
   * @param {Protocol.MessageWrapper} mw message to send
   * @returns {Promise<boolean>} promise resolves true if the message was sent.
   */
  async send(mw) {
    try {
      await this.#ws.send(JSON.stringify(mw));
    } catch (err) {
      log('message send failure', err);
      return false;
    }
    return true;
  }

  /**
   * Sends the reply to the client
   * @param {Protocol.ServerMessage} sm message to reply with
   */
  async #reply(sm) {
    const mw = Protocol.wrapResponse(sm, this.#svrPvtKey, this.#svrPubKey);
    log('server reply', sm.response, sm.responseToType, sm.content); // mw);
    return this.send(mw);
  }

  /**
   * verifies the client message, sends server response if message was bad
   * @param {Protocol.MessageWrapper} mw wrapper with sig
   * @param {Protocol.MessageType} type type field from the sent message
   * @returns {boolean} true if message was good, false if bad
   */
  #verify(mw, type) {
    if (!Protocol.verifyMessage(mw, this.user.publicKey)) {
      // failed
      log('sig verification failed');
      /** @type {Protocol.ServerMessage} */
      const sm = {
        reason: ServerMessageReason.signature,
        time: Date.now(),
        response: AccRej.reject,
        type: Protocol.MessageType.response,
        responseToType: type,
        origSig: mw.sig,
        content: {},
      };
      this.#reply(sm);
      return false;
    }
    log('message verified');
    return true;
  }

  /**
   * Determins if the user is ok for messaging, sends response if user isnt logged in
   * @param {Protocol.MessageWrapper} mw wrapper with sig
   * @param {Protocol.MessageType} type type field from the sent message
   * @returns {boolean} true if the user has passed keys and is good to take part
   */
  #loggedIn(mw, type) {
    if (this.user.connStatus === ConnectionStatus.connected
    || this.user.connStatus === ConnectionStatus.disconnected) {
      // failed
      log('message attempted while not logged in');
      /** @type {Protocol.ServerMessage} */
      const sm = {
        reason: ServerMessageReason.access,
        time: Date.now(),
        response: AccRej.reject,
        type: Protocol.MessageType.response,
        responseToType: type,
        origSig: mw.sig,
        content: {},
      };
      this.#reply(sm);
      return false;
    }
    return true;
  }

  /**
   * handles a message receieved from the client
   * @param {string} rawMessage the message recieved in string form
   * @event UserSocket#messageReceived
   */
  // eslint-disable-next-line class-methods-use-this
  async handleMessage(rawMessage) {
    /** @type {Protocol.MessageWrapper} */
    // @ts-ignore
    let mw = {};
    try {
      mw = JSON.parse(rawMessage);
    } catch (err) {
      log('error unmarshalling record');
      /** @type {Protocol.ServerMessage} */
      const sm = {
        reason: ServerMessageReason.format,
        responseToType: Protocol.MessageType.unknown,
        origSig: '',
        time: Date.now(),
        response: AccRej.reject,
        type: Protocol.MessageType.response,
        content: null,
      };
      await this.#reply(sm);
      return;
    }

    log('MESSAGE', mw);

    const cm = /** @type {Protocol.ClientMessage} */ (mw.message);

    // do message verification if we have keys
    if (this.user.connStatus === Protocol.ConnectionStatus.loggedIn) {
      this.#verify(mw, cm.type);
    }

    // generic, can be so many things so cant type it
    /** @type {object} */
    let serverContentResponse = {};

    switch (cm.type) {
      case 'hello': {
        /** @type {Protocol.HelloMessage} */
        const hello = cm.content;
        this.user.connStatus = ConnectionStatus.loggedIn;
        this.user.userStatus = UserStatus.online;
        this.user.publicKey = hello.publicKey;
        this.user.nick = cm.nick;

        // verify the message now that we have keys
        if (this.#verify(mw, cm.type)) {
          /** @type {Protocol.ServerHelloResponse} */
          const helloRes = {
            serverKey: this.#svrPubKey,
          };
          serverContentResponse.serverKey = helloRes;
          log('user logged in', this.user.nick);
        }
        break;
      }
      case 'subscribe': {
        // login check
        if (this.#loggedIn(mw, cm.type)) {
          /** @type {Protocol.SubscribeMessage} */
          const sub = cm.content;
          log('subscribe', sub);
          this.user.connStatus = ConnectionStatus.subscribed;
          /** @type {Protocol.ServerSubscribeResponse} */
          const subRes = {
            oldestMessageTime: this.#db.oldest(),
            latestMessageTime: this.#db.newest(),
          };
          serverContentResponse = subRes;
          break;
        }
        return; // bail cause login wasnt present
      }
      case 'history': {
        // login check
        if (this.#loggedIn(mw, cm.type)) {
          /** @type {Protocol.HistoryMessage} */
          const hist = cm.content;
          log('hist', hist.start, hist.end);
          // TODO: make smarter db call?
          const records = this.#db.all().filter((e) => e[0] > hist.start && e[0] < hist.end);
          /** @type {Protocol.ServerHistoryResponse} */
          const histRes = {
            msgList: records.map((m) => m[1]),
          };
          serverContentResponse = histRes;
          log('returning history messages', records.length);
          break;
        }
        return; // bail cause login wasnt present
      }
      case 'post': {
        // login check
        if (this.#loggedIn(mw, cm.type)) {
          /** @type {Protocol.PostMessage} */
          const post = cm.content;
          log('post', post.postContent);
          break;
        }
        return; // bail cause login wasnt present
      }
      default:
        log('unknown message type', cm.type);
    }

    /** @type {Protocol.ServerMessage} */
    const serverResponse = {
      type: Protocol.MessageType.response,
      responseToType: cm.type,
      response: AccRej.accept,
      time: Date.now(),
      origSig: mw.sig,
      content: serverContentResponse,
    };

    // wrap and send
    await this.#reply(serverResponse);

    // broadcast orig message to all clients
    /**
     * @event UserSocket#messageReceived
     * @type {Protocol.MessageWrapper}
     */
    this.emit('messageReceived', mw);
    log('reply sent');

    // store the record
    this.#db.set(cm.time, mw);
  }
}
