// @ts-check
import debug from 'debug';

// import * as Utils from './Utils.js';
import MemoryDB from './memory.js';

const log = debug('lugchat:DB');

/** @typedef {import('./model').BaseDB} BaseDB */

/** @type {BaseDB} */
// let dbInstance;

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
    case DBType.memory:
    default: {
      // dbInstance = new MemoryDB();
      log('memory db instance created');
      return new MemoryDB(props);
    }
  }
  // return dbInstance;
}

/**
 * @returns a database for use if one was instantiated
 */
// export function getDB() {
//   if (Utils.isntNull(dbInstance)) {
//     return dbInstance;
//   }
//   return null;
// }
