// @ts-check
import * as dotenv from 'dotenv';
import debug from 'debug';
import { createServer } from 'https';
import { statSync, readFileSync } from 'fs';
import { WebSocketServer } from 'ws';
import { Utils } from 'node-lugchat-common';

import { ConnectionStatus } from 'node-lugchat-common/lib/Protocol.js';
import UserSocket from './lib/UserSocket.js';

/** @typedef {import('node-lugchat-common/lib/Protocol.js').MessageWrapper} MessageWrapper */

dotenv.config();
const log = debug('lugchat:nodeServer');

const SERVER_CERT = process.env.SERVER_CERT || 'missing';
const SERVER_KEY = process.env.SERVER_KEY || 'missing';

// verify tls keys
const tlsKeyStat = statSync(SERVER_KEY);
const tlsCertStat = statSync(SERVER_CERT);
if (Utils.isNull(tlsCertStat) || !tlsCertStat.isFile()
  || Utils.isNull(tlsKeyStat) || !tlsKeyStat.isFile()) {
  console.log('missing tls key material', SERVER_CERT, SERVER_KEY);
  process.exit(1);
}

// verify signing keys
const PRIVATE_KEY_FILE = process.env.SIGNING_PRIVATE_KEY || 'missing';
const PUBLIC_KEY_FILE = process.env.SIGNING_PUBLIC_KEY || 'missing';

const ptStat = statSync(PRIVATE_KEY_FILE);
const pbStat = statSync(PUBLIC_KEY_FILE);

let pvtKeyStr = null;
let pubKeyStr = null;

if (Utils.isntNull(ptStat) && ptStat.isFile()
  && Utils.isntNull(pbStat) && pbStat.isFile()) {
  pvtKeyStr = readFileSync(PRIVATE_KEY_FILE, { encoding: 'utf-8' });
  pubKeyStr = readFileSync(PUBLIC_KEY_FILE, { encoding: 'utf-8' });
} else {
  console.log('did not locate signing key material');
  process.exit(1);
}

// HTTPS server
const server = createServer({ cert: readFileSync(SERVER_CERT), key: readFileSync(SERVER_KEY) });
// WebSocket Server
const wss = new WebSocketServer({ server });

/** @type {UserSocket[]} */
let trackedUsers = [];

/**
 * broadcasts the message out to all participants
 * @param {MessageWrapper} mw message to broadcast to all clients
 */
function broadcastMessage(mw) {
  // TODO: make sure its a messagewrapper!
  log('broadcasting message', mw?.message?.type);
  trackedUsers.forEach((us) => {
    if (us.user.connStatus === ConnectionStatus.subscribed) {
      // TODO: handle failed send
      us.send(mw);
    }
  });
}

// connection, listening, error
wss.on('connection', (ws, req) => {
  log('connection seen', req.socket.remoteAddress);
  const us = new UserSocket(ws, req, pvtKeyStr, pubKeyStr);
  // ensure good messages get re-broadcast to everyone
  us.on('messageReceived', (mw) => {
    broadcastMessage(mw);
  });
  // remove object from tracked users
  us.on('disconnected', () => {
    log('removing user for disconnect timeout', us.user.nick);
    trackedUsers = trackedUsers.filter((u) => us.user !== u.user);
    log('remaining users', trackedUsers.map((u) => u.user.nick));
  });
  // TODO: cleanup gone users
  trackedUsers.push(us);
});

server.listen(8080, () => {
  log('server online');
});
