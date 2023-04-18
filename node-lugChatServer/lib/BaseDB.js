/* eslint-disable no-unused-vars */
/* eslint-disable class-methods-use-this */
/**
 * @interface
 */
export default class BaseDB {
  /**
   * sets this key to this value
   * @param {string} key id of the record to set
   * @param {any} value thingy worth keeping
   */
  set(key, value) {
    throw new Error('not implemented');
  }

  /**
   * retrieves the key if present
   * @param {string} key id of the record to set
   */
  get(key) {
    throw new Error('not implemented');
  }

  /**
   * Checks if key is contained in the store
   * @param {string} key id of the record to set
   * @returns {boolean} true if the key is in the storate
   */
  has(key) {
    throw new Error('not implemented');
  }

  /**
   * deletes the key if present
   * @param {string} key id of the record to set
   * @returns true if deleted, false if something went wrong, undefined if not found
   */
  delete(key) {
    throw new Error('not implemented');
  }

  /**
   * noop in memory db
   */
  // eslint-disable-next-line class-methods-use-this
  sync() {}
}
