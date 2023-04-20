/**
 * @interface
 */
export interface BaseDB {
    /**
     * sets this key to this value
     * @param {number} key id of the record to set
     * @param {any} value thingy worth keeping
     */
    set(key: number, value: any);
  
    /**
     * retrieves the key if present
     * @param {number} key id of the record to set
     */
    get(key: number);
  
    /**
     * Checks if key is contained in the store
     * @param {number} key id of the record to set
     * @returns {boolean} true if the key is in the storate
     */
    has(key: number);
  
    /**
     * deletes the key if present
     * @param {number} key id of the record to set
     * @returns true if deleted, false if something went wrong, undefined if not found
     */
    delete(key: number);

    /**
     * You probably dont wanna call this
     * @returns array of records held in the db
     */
    all(): Record<number, any>[];

    /**
     * returns the oldest message the db knows about
     * @returns {number} timestamp of the oldest record, 0 if no records exist
     */
    oldest();

    /**
     * Returns the latest record
     * @returns {number} latest record we know of, 0 if no records exist
     */
    newest();
  
    /**
     * noop in memory db
     */
    // eslint-disable-next-line class-methods-use-this
    sync();
  }