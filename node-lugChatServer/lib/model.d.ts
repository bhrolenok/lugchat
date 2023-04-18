/**
 */
export interface BaseDB {
    /**
     * sets this key to this value
     * @param {string} key id of the record to set
     * @param {any} value thingy worth keeping
     */
    set(key, value);
  
    /**
     * retrieves the key if present
     * @param {string} key id of the record to set
     */
    get(key);
  
    /**
     * Checks if key is contained in the store
     * @param {string} key id of the record to set
     * @returns {boolean} true if the key is in the storate
     */
    has(key);
  
    /**
     * deletes the key if present
     * @param {string} key id of the record to set
     * @returns true if deleted, false if something went wrong, undefined if not found
     */
    delete(key);
  
    /**
     * noop in memory db
     */
    // eslint-disable-next-line class-methods-use-this
    sync();
  }