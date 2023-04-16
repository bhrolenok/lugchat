// @ts-check
import debug from 'debug';
import EventEmitter from 'events';
import { Utils, Protocol } from 'node-lugchat-common';

const {
  AccRej, ConnectionStatus, UserStatus, ServerMessageReason,
} = Protocol;
const log = debug('lugchat:nodeServer');

/** @typedef {import('ws').WebSocket} WebSocket */

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

  /**
   * Create a new object to handle the requests coming in from this user
   * @param {WebSocket} ws websocket that connected
   * @param {import('http').IncomingMessage} req figure out where this comes from
   * @param {string} svrPvtKey key for signing messages
   * @param {string} svrPubKey key for sending clients
   * @event UserSocket#disconnected
   */
  constructor(ws, req, svrPvtKey, svrPubKey) {
    super();
    this.#ws = ws;
    this.#svrPvtKey = svrPvtKey;
    this.#svrPubKey = svrPubKey;

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
      nick: '',
      publicKey: '',
    };

    log('new connection', this.user);

    // force binding this to the handlemethod since its called via eventing
    this.handleMessage = this.handleMessage.bind(this);

    ws.on('message', this.handleMessage);
    // special ws response used for keeping the connection open
    ws.on('pong', () => {
      this.user.connStatus = ConnectionStatus.connected;
    });
    // setup interval for requesting pong response every 30s
    this.#timer = setInterval(() => {
      if (this.user.connStatus === ConnectionStatus.disconnected) {
        ws.terminate();
        clearInterval(this.#timer);
        this.emit('disconnected');
      }
      this.user.connStatus = ConnectionStatus.disconnected;
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
   * Sends the reply to the client
   * @param {Protocol.ServerMessage} sm message to reply with
   */
  async #reply(sm) {
    const mw = Protocol.wrapResponse(sm, this.#svrPvtKey);
    log('server reply', mw);
    return this.#ws.send(JSON.stringify(mw));
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

    // do message verification
    if (this.user.connStatus === Protocol.ConnectionStatus.loggedIn) {
      if (!Protocol.verifyMessage(mw, this.user.publicKey)) {
        // failed
        log('sig verification failed');
        /** @type {Protocol.ServerMessage} */
        const sm = {
          reason: ServerMessageReason.signature,
          time: Date.now(),
          response: AccRej.reject,
          type: Protocol.MessageType.response,
          responseToType: cm.type,
          origSig: mw.sig,
          content: {},
        };
        await this.#reply(sm);
        return;
      }
      log('message verified');
    }

    const serverContentResponse = {};

    switch (cm.type) {
      case 'hello': {
        /** @type {Protocol.HelloMessage} */
        const hello = cm.content;
        this.user.connStatus = ConnectionStatus.loggedIn;
        this.user.userStatus = UserStatus.online;
        this.user.publicKey = hello.publicKey;
        this.user.nick = cm.nick;

        // TODO: can verify the login message now!

        serverContentResponse.serverKey = this.#svrPubKey;
        log('user logged in', this.user.nick);
        break;
      }
      case 'post': {
        // TODO: login check
        /** @type {Protocol.PostMessage} */
        const post = cm.content;
        log('post', post.postContent);
        break;
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
  }
}
