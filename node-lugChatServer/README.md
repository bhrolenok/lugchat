# Node LugChat Server

## Getting started

* install node 16+ and npm
* `npm install` from this directory
* generate a keypair to use
  * an example, feel free to change
  * `openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 365 -nodes -subj '/CN=localhost'`
* generate a signing keypair to use
  * `openssl genrsa -out private.pem 4096`
  * `openssl rsa -in private.pem -pubout -out public.pem`
* create env file (see next section)
* run via `DEBUG=* node server.js`
  * can omit the `DEBUG=*` if you dont want it to log anything, but who does that?

### .env file

```
# path to the cert
SERVER_CERT=cert.pem
# path to the private key
SERVER_KEY=key.pem
# key used to sign message responses
SIGNING_PRIVATE_KEY=private.pem
# public key (pair of the private key) for verifying
SIGNING_PUBLIC_KEY=public.pem
```