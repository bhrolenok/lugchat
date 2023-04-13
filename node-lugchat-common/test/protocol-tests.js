/* eslint-disable no-unused-expressions */
import crypto from 'crypto';
import { promisify } from 'util';
import should from 'chai';

import * as Protocol from '../lib/Protocol.js';

// enable .should.xxx
should.should();

const generateKeyPair = promisify(crypto.generateKeyPair);

describe('Protocol tests', () => {
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
      /** @type {Protocol.ClientMessage} */
      const message = {
        type: Protocol.MessageType.post,
        time: Date.now(),
        nick: 'unitTests',
        content: {
          postContent: 'hi',
        },
      };
      /** @type {Protocol.MessageWrapper} */
      const mw = Protocol.wrapResponse(message, pvk);
      mw.should.have.property('sig');
      mw.should.have.property('message');

      const v = Protocol.verifyMessage(mw, pbk);
      v.should.equal(true);
    });
  });
});
