// @ts-check
/** @typedef {import('./model').BaseDB} BaseDB */

const optionDefaults = {
  maxDuration: 0,
  maxRecords: 1000,
};

/**
 * @implements {BaseDB}
 */
export default class MemoryDB {
  /** @type {Record<string, any>} */
  #keyStore;

  /** @type {number} */
  #maxDuration;

  /** @type {number} */
  #maxRecords;

  /**
   * Initializes the memory db, options default to maxRecords limit.
   * In either case the oldest records are dumped first
   * @param {object} options
   * @param {number} options.maxDuration time in ms from now to keep (e.g. 1 day = 86400000)
   * @param {number} options.maxRecords total number of records to limit to
   */
  constructor(options) {
    const config = { ...optionDefaults, ...options };
    this.#maxDuration = config.maxDuration;
    this.#maxRecords = config.maxRecords;
  }

  /**
   * keeps the store in line with the limits set
   */
  #maintain() {
    if (this.#maxDuration !== 0) {
      const tooOld = Date.now() - this.#maxDuration;
      const keys = Object.keys(this.#keyStore).sort();
      while (keys.length > 0 && +keys[0] < tooOld) {
        delete this.#keyStore[keys[0]];
        keys.shift();
      }
    }

    if (this.#maxRecords !== 0) {
      const keys = Object.keys(this.#keyStore).sort();
      while (keys.length > this.#maxRecords) {
        delete this.#keyStore[keys[0]];
        keys.shift();
      }
    }
  }

  set(key, value) {
    this.#keyStore[key] = value;
    this.#maintain();
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
