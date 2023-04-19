// @ts-check
import debug from 'debug';

import { Utils } from 'node-lugchat-common';
import MemoryDB from './memory.js';

const log = debug('lugchat:nodeServer');

/** @typedef {import('./model').BaseDB} BaseDB */

/** @type {BaseDB} */
let dbInstance;

/**
 * @enum {string}
 */
export const DBType = {
  memory: 'memory',
};

/**
 * Get an instance of the db
 * @param {DBType} type which type of db should we use
 * @param {object} props additional properties for the db type
 * @returns {BaseDB} db instance
 */
// eslint-disable-next-line no-unused-vars
export function initDB(type, props) {
  switch (type) {
    case DBType.memory: {
      dbInstance = new MemoryDB();
      log('memory db instance created');
      break;
    }
    default:
      break;
  }
  return dbInstance;
}

/**
 * @returns a database for use if one was instantiated
 */
export function getDB() {
  if (Utils.isntNull(dbInstance)) {
    return dbInstance;
  }
  return null;
}
