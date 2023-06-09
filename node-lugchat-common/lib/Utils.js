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
 * signs the given content with the private key
 * @param {string | crypto.KeyObject} privateKey string contents of the private key
 * @param {string} content string to sign
 */
function sign(privateKey, content) {
  const s = crypto.createSign('SHA512');
  s.write(content);
  s.end();
  return s.sign(privateKey, 'base64');
}

/**
 * hash the given string with md5 into base64 format
 * @param {string|object} str if object, JSON.stringify is called prior to sum
 * @returns {string} base64 format md5 sum
 */
function md5(str) {
  if (typeof str === 'object') {
    return crypto.createHash('md5').update(JSON.stringify(str)).digest('base64').toString();
  }
  return crypto.createHash('md5').update(str).digest('base64').toString();
}

/**
 * uses the public key to verify the string passed in
 * @param {string | crypto.KeyObject} pubKey key to use
 * @param {string} sig signature to verify
 * @param {string} str content to verify
 * @returns {boolean} true if sig checked out
 */
function verify(pubKey, sig, str) {
  const v = crypto.createVerify('SHA512');
  v.write(str);
  v.end();
  return v.verify(pubKey, sig, 'base64');
}

export {
  delay, isNull, isntNull, md5, sign, verify,
};
