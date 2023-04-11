import * as dotenv from 'dotenv';
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { WebSocket } from 'ws';
import { Protocol, Utils } from 'node-lugchat-common';

dotenv.config();

// /** @typedef {Prolo.PostMessage} PostMessage */
/** @typedef {import('node-lugchat-common/lib/Protocol').ServerMessage} ServerMessage */
/** @typedef {import('node-lugchat-common/lib/Protocol').MessageWrapper} MessageWrapper */

const ENV_NICK = process.env.lugchat_nick || 'missing';
const ENV_URI = process.env.lugchat_uri || 'missing';

const screen = blessed.screen({ smartCSR: true });

console.log(`rows ${screen.rows} cols ${screen.cols}`);
// process.exit(1);

// eslint-disable-next-line new-cap
const screenGrid = new contrib.grid({ rows: 12, cols: 12, screen });

// grid.set(row, col, rowSpan, colSpan, obj, obj_opts)

const chatLog = screenGrid.set(0, 0, 6, 12, contrib.log, {
  // fg: 'green',
  label: 'Chat',
  tags: true,
  border: { type: 'line', fg: 'cyan' },
});

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

const ws = new WebSocket(uri, { rejectUnauthorized: false });

ws.on('error', (err) => {
  log.log(err.message);
  return process.exit(1);
});

ws.on('message', async (data) => {
  log.log(`message received ${data}`);
  /** @type {MessageWrapper} */
  let wrapper = null;
  try {
    wrapper = JSON.parse(data);
    if (Utils.isNull(wrapper.message)) {
      throw new Error('malformed message');
    }
  } catch (err) {
    log.log('unable to read the message, skipping');
    return;
  }

  const { message } = wrapper;

  switch (message.type) {
    case 'response': {
      /** @type {ServerMessage} */
      const sm = wrapper.message;
      // TODO: probably should get rid of input content here if its a post reply!
      break;
    }
    case 'hello': {
      /** @type {Protocol.ClientMessage} */
      const cm = wrapper.message;
      // /** @type {Protocol.HelloMessage} */
      // const hm = cm.content;
      // TODO: store nick/pubKey
      chatLog.log(`{green-fg}${cm.nick}{/green-fg} - logged on`);
      break;
    }
    case 'post': {
      /** @type {Protocol.ClientMessage} */
      const cm = wrapper.message;
      /** @type {Protocol.PostMessage} */
      const pm = cm.content;
      chatLog.log(`{red-fg}${cm.nick}{/red-fg} - ${pm.postContent}`);
      break;
    }
    default: {
      log.log(`unknown message type ${message.type}`);
      break;
    }
  }
});

ws.on('open', async () => {
  log.log('connection opened');
  // senc login event
  const message = {
    type: 'hello',
    nick,
    time: new Date().getTime(),
    content: {
      publicKey: '123',
    },
  };

  await ws.send(JSON.stringify(Protocol.wrapResponse(message)));
  log.log('login sent');
});

textInput.key('enter', async () => {
  // TODO: empty value check
  const message = textInput.getValue();
  log.log(`textarea enter pressed, message '${message}'`);
  // silly way to clear and keep box focus
  textInput.clearValue();
  textInput.focus();
  log.log('sending message');
  await ws.send(JSON.stringify(Protocol.wrapResponse({
    type: 'post',
    time: new Date().getTime(),
    nick,
    content: {
      postContent: message,
    },
  })));
  log.log('message sent');
});

// let quit still work
textInput.key(['escape', 'C-c'], () => {
  log.log('quit called');
  return process.exit(0);
});
