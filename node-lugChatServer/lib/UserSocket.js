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
  #pvtKey;

  /** @type {User} */
  user;

  /**
   * Create a new object to handle the requests coming in from this user
   * @param {WebSocket} ws websocket that connected
   * @param {import('http').IncomingMessage} req figure out where this comes from
   */
  constructor(ws, req, pvtKey) {
    super();
    this.#ws = ws;
    this.#pvtKey = pvtKey;
    log('req', req.socket.remoteAddress);

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
        type: 'foo',
      };
      await this.#ws.send(JSON.stringify(Protocol.wrapResponse(sm, this.#pvtKey)));
      return;
    }

    log('MESSAGE', mw);

    const { message } = mw;

    const serverContentResponse = {};

    switch (message.type) {
      case 'hello': {
        /** @type {HelloMessage} */
        const hello = message.content;
        this.user.connStatus = ConnectionStatus.loggedIn;
        this.user.userStatus = UserStatus.online;
        this.user.publicKey = hello.publicKey;

        serverContentResponse.serverKey = 'serverkey';
        break;
      }
      case 'post': {
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
    await this.#ws.send(JSON.stringify(Protocol.wrapResponse(serverResponse, this.#pvtKey)));

    // broadcast orig message to all clients
    this.emit('messageReceived', mw);
    log('reply sent');
  }
}
