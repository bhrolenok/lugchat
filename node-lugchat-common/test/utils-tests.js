/* eslint-disable no-unused-expressions */
import crypto from 'crypto';
import { promisify } from 'util';
import should from 'chai';

import * as Utils from '../lib/Utils.js';

const { expect } = should;

const generateKeyPair = promisify(crypto.generateKeyPair);

describe('utils tests', () => {
  describe('delay()', () => {
    it('should create a promise with the timeout', async () => {
      let delay = Utils.delay(500);
      let result = await Promise.race([delay, Promise.resolve('resolved')]);
      expect(result).to.equal('resolved');

      delay = Utils.delay(10);
      result = await Promise.race([delay, new Promise((res) => { setTimeout(res, 20, 'resolved'); })]);
      expect(result).to.be.undefined; // eslint-disable-line no-unused-expressions
    });
  });

  describe('isNull()', () => {
    it('should find null values', () => {
      expect(Utils.isNull(null)).to.be.true;
      expect(Utils.isNull(undefined)).to.be.true;
    });

    it('shouldnt find null values', () => {
      expect(Utils.isNull(1)).to.be.false;
      expect(Utils.isNull('string')).to.be.false;
      expect(Utils.isNull({})).to.be.false;
    });
  });

  describe('isntNull()', () => {
    it('should find null values', () => {
      expect(Utils.isntNull(null)).to.be.false;
      expect(Utils.isntNull(undefined)).to.be.false;
    });

    it('shouldnt find null values', () => {
      expect(Utils.isntNull(1)).to.be.true;
      expect(Utils.isntNull('string')).to.be.true;
      expect(Utils.isntNull({})).to.be.true;
    });
  });

  describe('crypto tests', () => {
    /** @type {crypto.KeyObject} */
    let pvk = null;
    /** @type {crypto.KeyObject} */
    let pbk = null;
    before(async () => {
      const kp = await generateKeyPair('rsa', { modulusLength: 2048 });
      pvk = kp.privateKey;
      pbk = kp.publicKey;
    });

    it('should sign and verify', async () => {
      const content = 'foo';
      const sig = Utils.sign(pvk, content);
      expect(Utils.verify(pbk, sig, content)).to.be.true;
    });
  });
});
