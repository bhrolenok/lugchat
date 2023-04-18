// @ts-check
import BaseDB from './BaseDB.js';

/**
 * @implements {BaseDB}
 */
export default class MemoryDB extends BaseDB {
  /** @type {Record<string, any>} */
  #keyStore;

  set(key, value) {
    this.#keyStore[key] = value;
  }

  /**
   * retrieves the key if present
   * @param {string} key id of the record to set
   */
  get(key) {
    return this.#keyStore[key];
  }

  /**
   * Checks if key is contained in the store
   * @param {string} key id of the record to set
   * @returns {boolean} true if the key is in the storate
   */
  has(key) {
    return Object.prototype.hasOwnProperty.call(this.#keyStore, key);
  }

  /**
   * deletes the key if present
   * @param {string} key id of the record to set
   * @returns true if deleted, false if something went wrong, undefined if not found
   */
  delete(key) {
    if (this.has(key)) {
      return delete this.#keyStore[key];
    }
    return undefined;
  }

  /**
   * noop in memory db
   */
  // eslint-disable-next-line class-methods-use-this
  sync() {}
}
