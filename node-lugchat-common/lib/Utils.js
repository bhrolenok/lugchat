import crypto from 'node:crypto';

/**
 * null test
 * @param {*} val any object
 * @returns true if its null or undefined
 */
function isNull(val) {
  return val === undefined || val === null;
}

/**
 * @param {*} val any object
 * @returns true if the val is not null and not undefined
 */
function isntNull(val) {
  return val !== null && val !== undefined;
}

/**
 * simple promise we can wait for to 'sleep'
 * @param {number} ms how many ms to sleep for
 * @returns {Promise} empty resolve when the time is met
 */
const delay = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

/**
 * MD5 Hash
 * @param {Object|string} str pass an object (which will be stringified) or string
 * @returns md5 hash
 */
function md5(str) {
  if (typeof str === 'object') {
    return crypto.createHash('md5').update(JSON.stringify(str)).digest('hex').toString();
  }
  return crypto.createHash('md5').update(str).digest('hex').toString();
}

export {
  delay, md5, isNull, isntNull,
};
