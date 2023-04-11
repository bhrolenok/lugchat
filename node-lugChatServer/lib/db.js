/**
 * Simple fake db layer for now
 */

/**
 * @typedef {Object} KV
 * @property {string} key
 * @property {string} value
 */

class MemoryDB {
  /** @type {Object.<string, KV[]} */
  #tables;

  Read() {

  }
}

export function InitDB() {

}