import * as dotenv from 'dotenv';
import debug from 'debug';
import { createServer } from 'https';
import { readFileSync } from 'fs';
import { WebSocketServer, WebSocket } from 'ws';

import UserSocket from './lib/UserSocket.js';

dotenv.config();
const log = debug('lugchat:nodeServer');

const SERVER_CERT = process.env.SERVER_CERT || 'missing';
const SERVER_KEY = process.env.SERVER_KEY || 'missing';

const server = createServer({
  cert: readFileSync(SERVER_CERT),
  key: readFileSync(SERVER_KEY),
});
const wss = new WebSocketServer({ server });

/**
 * broadcasts the message out to all participants
 * @param {Protocol.MessageWrapper} mw message to broadcast to all clients
 */
function broadcastMessage(mw) {
  // TODO: make sure its a messagewrapper!
  log('broadcasting message', mw?.message?.type);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(JSON.stringify(mw));
    }
  });
}

/** @type {[UserSocket]} */
const trackedUsers = [];

// connection, listening, error
wss.on('connection', (ws, req) => {
  log('connection seen', req.socket.remoteAddress);
  const us = new UserSocket(ws, req);
  // ensure good messages get re-broadcast to everyone
  us.on('messageReceived', (mw) => {
    broadcastMessage(mw);
  });
  // TODO: cleanup gone users
  trackedUsers.push(us);
});

server.listen(8080, () => {
  log('server online');
});
