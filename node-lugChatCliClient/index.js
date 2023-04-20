// @ts-check
import * as dotenv from 'dotenv';
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { WebSocket } from 'ws';
import { DB, Protocol, Utils } from 'node-lugchat-common';
import fs from 'fs';

// eslint-disable-next-line import/extensions
// import ChatLog from './lib/ChatLog.js';

const { MessageType } = Protocol;

dotenv.config();

// /** @typedef {Prolo.PostMessage} PostMessage */
/** @typedef {import('node-lugchat-common/lib/Protocol').ServerMessage} ServerMessage */
/** @typedef {import('node-lugchat-common/lib/Protocol').MessageWrapper} MessageWrapper */

const ENV_NICK = process.env.lugchat_nick || 'missing';
const ENV_URI = process.env.lugchat_uri || 'missing';

const PRIVATE_KEY_FILE = process.env.lugchat_privatekey_file || 'missing';
const PUBLIC_KEY_FILE = process.env.lugchat_pubkey_file || 'missing';

const ptStat = fs.statSync(PRIVATE_KEY_FILE);
const pbStat = fs.statSync(PUBLIC_KEY_FILE);

let pvtKeyStr = null;
let pubKeyStr = null;

if (Utils.isntNull(ptStat) && ptStat.isFile()
  && Utils.isntNull(pbStat) && pbStat.isFile()) {
  pvtKeyStr = fs.readFileSync(PRIVATE_KEY_FILE, { encoding: 'utf-8' });
  pubKeyStr = fs.readFileSync(PUBLIC_KEY_FILE, { encoding: 'utf-8' });
} else {
  console.log('did not locate key material');
  process.exit(1);
}
const screen = blessed.screen({ smartCSR: true });

// TODO: figure grid cols out from actual cols!
// console.log(`rows ${screen.rows} cols ${screen.cols}`);

// eslint-disable-next-line new-cap
const screenGrid = new contrib.grid({ rows: 12, cols: 12, screen });

/** @type {contrib.Widgets.LogElement} */
const chatLog = screenGrid.set(0, 0, 6, 12, contrib.log, {
  // fg: 'green',
  label: 'Chat',
  tags: true,
  border: { type: 'line', fg: 'cyan' },
});

let lastDay = 0;
const chatDB = DB.initDB(DB.DBType.memory, { maxRecords: 30 });

/**
 * appends new message onto the chatLog
 * @param {Protocol.ClientMessage} bm
 * @param {string} msg what to add
 * @param {string} [color] optional color to decorate name with
 */
function addChat(bm, msg, color) {
  let c = color;
  if (Utils.isNull(color)) {
    c = 'cyan';
  }

  // ! Could be adding an older message, redo!
  const d = new Date(bm.time);
  const day = d.getDate();
  let dateStr = '';
  if (day !== lastDay) {
    lastDay = day;
    dateStr += `${d.toDateString()} `;
  }
  dateStr += d.toTimeString().substring(0, 8);
  const chatStr = `{${c}-fg}${bm.nick}{/${c}-fg} [${dateStr}] - ${msg}`;
  chatDB.set(bm.time, chatStr);
  const msgs = chatDB.all();
  chatLog.setItems(msgs.map((r) => r[1]));
  chatLog.scrollTo(msgs.length);
}

const textInput = screenGrid.set(6, 0, 3, 12, blessed.textarea, {
  label: 'Say',
  inputOnFocus: true,
  padding: {
    top: 1,
    left: 2,
  },
  style: {
    fg: '#787878',
    bg: '#454545',
    focus: {
      fg: '#f6f6f6',
      bg: '#353535',
    },
  },
});

const log = screenGrid.set(9, 0, 3, 12, contrib.log, {
  fg: 'green',
  label: 'Server Log',
  tags: true,
  border: { type: 'line', fg: 'cyan' },
});

textInput.focus();

// let quit still work
screen.key(['escape', 'C-c'], () => {
  log.log('quit called');
  return process.exit(0);
});

screen.render();

log.log('initializing connection');
const nick = ENV_NICK;
const uri = ENV_URI;

log.log(`user ${nick} connecting to ${uri}`);

// WebSocket Connection
const ws = new WebSocket(uri, { rejectUnauthorized: false });

/**
 * sends a clientmessage to the server
 * @param {Protocol.ClientMessage} message what to ship to the server
 */
async function send(message) {
  await ws.send(JSON.stringify(Protocol.wrapResponse(message, pvtKeyStr)));
}

// Handle Errors
ws.on('error', (err) => {
  // TODO: get smarter about error type
  log.log(err.message);
  return process.exit(1);
});

/**
 * Process a given message
 * @param {MessageWrapper} wrapper
 */
async function handleMessage(wrapper) {
  const { message } = wrapper;
  log.log(`handling message type ${message.type}`);

  switch (message.type) {
    // server message
    case 'response': {
      const sm = /** @type {Protocol.ServerMessage} */ (message);
      // TODO: probably should get rid of input content here if its a post reply!
      switch (sm.responseToType) {
        case MessageType.history: {
          const histRes = /** @type {Protocol.ServerHistoryResponse} */ (sm.content);
          log.log(`server history reply with ${histRes.msgList.length} messages`);
          histRes.msgList.forEach((msg) => {
            log.log(`sending message ${msg.message.type} to handle`);
            handleMessage(msg);
          });
          break;
        }
        case MessageType.subscribe: {
          // get the timestamps to send a history request
          const subRes = /** @type {Protocol.ServerSubscribeResponse} */ (sm.content);
          // wierd empty server?
          if (subRes.latestMessageTime === 0) {
            break;
          }
          // ? really dont have to do this tbh, could just request w/e anyways
          /** @type {Protocol.HistoryMessage} */
          const content = {
            start: subRes.oldestMessageTime,
            end: subRes.latestMessageTime,
          };
          await send({
            type: MessageType.history,
            nick,
            time: Date.now(),
            content,
          });
          break;
        }
        default: {
          log.log(`ignoring server response ${sm.responseToType}`);
          break;
        }
      }
      break;
    }
    case MessageType.hello: {
      const cm = /** @type {Protocol.ClientMessage} */ (message);
      // /** @type {Protocol.HelloMessage} */
      // const hm = cm.content;
      // TODO: store nick/pubKey
      addChat(cm, 'logged on', 'green');
      break;
    }
    case MessageType.post: {
      const cm = /** @type {Protocol.ClientMessage} */ (message);
      /** @type {Protocol.PostMessage} */
      const pm = cm.content;
      addChat(cm, pm.postContent);
      break;
    }
    // case MessageType.subscribe: {
    //   // TODO: message doesnt have the nick, so cant do much with it
    //   break;
    // }
    default: {
      log.log(`ignoring message type ${message.type}`);
      break;
    }
  }
}

// listen for incomming messages
ws.on('message', async (data) => {
  log.log(`message received ${data}`);
  /** @type {MessageWrapper | null} */
  let wrapper = null;
  try {
    wrapper = JSON.parse(data.toString());
    if (Utils.isNull(wrapper?.message)) {
      throw new Error('malformed message');
    }
  } catch (err) {
    log.log('unable to read the message, skipping');
    return;
  }
  handleMessage(/** @type {MessageWrapper} */ (wrapper));
});

// first connect, send login and get user list
ws.on('open', async () => {
  log.log('connection opened');
  // send login event
  const message = {
    type: 'hello',
    nick,
    time: Date.now(),
    content: {
      publicKey: pubKeyStr,
    },
  };

  await send(message);
  log.log('login sent');

  /** @type {Protocol.SubscribeMessage} */
  const sub = {
    publicKey: pubKeyStr,
    lastClientTime: 0,
  };

  // subscribe
  const subMessage = {
    type: 'subscribe',
    nick,
    time: Date.now(),
    content: sub,
  };

  await send(subMessage);
  log.log('subscribed');
});

textInput.key('enter', async () => {
  // TODO: empty value check
  const postContent = textInput.getValue();
  log.log(`textarea enter pressed, message '${postContent}'`);
  // silly way to clear and keep box focus
  textInput.clearValue();
  textInput.focus();
  /** @type {Protocol.ClientMessage} */
  const message = {
    type: 'post',
    time: Date.now(),
    nick,
    content: {
      postContent,
    },
  };
  log.log('sending message');
  await send(message);
  log.log('message sent');
});

// let quit still work
textInput.key(['escape', 'C-c'], () => {
  log.log('quit called');
  return process.exit(0);
});
