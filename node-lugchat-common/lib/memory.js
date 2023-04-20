// @ts-check
import debug from 'debug';

const log = debug('lugchat:memoryDB');

/** @typedef {import('./model').BaseDB} BaseDB */

const optionDefaults = {
  maxDuration: 0,
  maxRecords: 1000,
};

/**
 * A time based key-value store
 * @class
 * @implements {BaseDB}
 */
export default class MemoryDB {
  /** @type {Record<number, any>} */
  #keyStore;

  /** @type {number} */
  #maxDuration;

  /** @type {number} */
  #maxRecords;

  /**
   * Initializes the memory db, options default to maxRecords limit.
   * In either case the oldest records are dumped first
   * @param {object} [options]
   * @param {number} options.maxDuration time in ms from now to keep (e.g. 1 day = 86400000)
   * @param {number} options.maxRecords total number of records to limit to
   */
  constructor(options) {
    const config = { ...optionDefaults, ...options };
    this.#maxDuration = config.maxDuration;
    this.#maxRecords = config.maxRecords;
    log('config', config);
    this.#keyStore = {};
  }

  #keys() {
    return Object.keys(this.#keyStore).sort();
  }

  /**
   * keeps the store in line with the limits set
   */
  #maintain() {
    if (this.#maxDuration !== 0) {
      const tooOld = Date.now() - this.#maxDuration;
      const keys = this.#keys();
      while (keys.length > 0 && +keys[0] < tooOld) {
        delete this.#keyStore[keys[0]];
        log('dumped record that was too old', keys[0]);
        keys.shift();
      }
    }

    if (this.#maxRecords !== 0) {
      const keys = this.#keys();
      while (keys.length > this.#maxRecords) {
        delete this.#keyStore[keys[0]];
        log('dumped record that was too many', keys[0]);
        keys.shift();
      }
    }
  }

  set(key, value) {
    log('storing key', key);
    this.#keyStore[key] = value;
    this.#maintain();
  }

  get(key) {
    return this.#keyStore[key];
  }

  has(key) {
    return Object.prototype.hasOwnProperty.call(this.#keyStore, key);
  }

  delete(key) {
    if (this.has(key)) {
      return delete this.#keyStore[key];
    }
    return undefined;
  }

  oldest() {
    const keys = this.#keys();
    return keys.length === 0 ? 0 : keys[0];
  }

  newest() {
    const keys = this.#keys();
    return keys.length === 0 ? 0 : keys[keys.length - 1];
  }

  all() {
    return Object.entries(this.#keyStore);
  }

  /**
   * noop in memory db
   */
  // eslint-disable-next-line class-methods-use-this
  sync() {}
}
