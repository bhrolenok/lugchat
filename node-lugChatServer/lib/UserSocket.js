import debug from 'debug';
import EventEmitter from 'events';
import { Protocol } from 'node-lugchat-common';

const {
  AccRej, ConnectionStatus, UserStatus, ServerMessageReason,
} = Protocol;
const log = debug('lugchat:nodeServer');

/** @typedef {import('ws').WebSocket} WebSocket */

export default class UserSocket extends EventEmitter {
  /** @type {WebSocket} */
  #ws;

  /** @type {string} */
  #svrPvtKey;

  /** @type {string} */
  #svrPubKey;

  /** @type {Protocol.User} */
  user;

  /**
   * Create a new object to handle the requests coming in from this user
   * @param {WebSocket} ws websocket that connected
   * @param {import('http').IncomingMessage} req figure out where this comes from
   * @param {string} svrPvtKey key for signing messages
   * @param {string} svrPubKey key for sending clients
   */
  constructor(ws, req, svrPvtKey, svrPubKey) {
    super();
    this.#ws = ws;
    this.#svrPvtKey = svrPvtKey;
    this.#svrPubKey = svrPubKey;

    // default take the remoteaddress, which could be a load balancer
    let ipAddr = req.socket.remoteAddress;

    // if forwarded header is set, lets take that instead
    if (req.headers['x-forwarded-for'] !== undefined) {
      ipAddr = req.headers['x-forwarded-for'].split(',')[0].trim();
    }

    this.user = {
      ip: ipAddr,
      userStatus: UserStatus.online,
      connStatus: ConnectionStatus.connected,
    };

    log('new connection', this.user);

    // force binding this to the handlemethod since its called via eventing
    this.handleMessage = this.handleMessage.bind(this);

    ws.on('message', this.handleMessage);
    ws.on('error', (err) => {
      log('socket failure', err);
    });
    ws.on('disconnect', () => {
      log('client disconnected');
    });
  }

  /**
   * handles a message receieved from the client
   * @param {string} rawMessage the message recieved in string form
   */
  // eslint-disable-next-line class-methods-use-this
  async handleMessage(rawMessage) {
    /** @type {MessageWrapper} */
    let mw = null;
    try {
      mw = JSON.parse(rawMessage);
    } catch (err) {
      log('error unmarshalling record');
      /** @type {ServerMessage} */
      const sm = {
        reason: ServerMessageReason.format,
        time: new Date().getTime(),
        response: AccRej.reject,
        type: 'unknown',
      };
      await this.#ws.send(JSON.stringify(Protocol.wrapResponse(sm, this.#svrPvtKey)));
      return;
    }

    log('MESSAGE', mw);

    const { message } = mw;

    // do message verification
    if (this.user.connStatus === Protocol.ConnectionStatus.loggedIn) {
      if (!Protocol.verifyMessage(mw, this.user.publicKey)) {
        // failed
        log('sig verification failed');
        /** @type {ServerMessage} */
        const sm = {
          reason: ServerMessageReason.signature,
          time: new Date().getTime(),
          response: AccRej.reject,
          type: message.type,
        };
        await this.#ws.send(JSON.stringify(Protocol.wrapResponse(sm, this.#svrPvtKey)));
        return;
      }
      log('message verified');
    }

    const serverContentResponse = {};

    switch (message.type) {
      case 'hello': {
        /** @type {Protocol.HelloMessage} */
        const hello = message.content;
        this.user.connStatus = ConnectionStatus.loggedIn;
        this.user.userStatus = UserStatus.online;
        this.user.publicKey = hello.publicKey;
        this.user.nick = message.nick;

        // TODO: can verify the login message now!

        serverContentResponse.serverKey = this.#svrPvtKey;
        log('user logged in', this.user.nick);
        break;
      }
      case 'post': {
        // TODO: login check
        /** @type {PostMessage} */
        const post = message.content;
        log('post', post.postContent);
        break;
      }
      default:
        log('unknown message type', message.type);
    }

    /** @type {serverResponse} */
    const serverResponse = {
      type: 'response',
      responseTo: message.type,
      response: AccRej.accept,
      time: new Date().getTime(),
      content: serverContentResponse,
    };

    // wrap and send
    await this.#ws.send(JSON.stringify(Protocol.wrapResponse(serverResponse, this.#svrPvtKey)));

    // broadcast orig message to all clients
    this.emit('messageReceived', mw);
    log('reply sent');
  }
}
