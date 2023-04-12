# Node LugChat Server

## Getting started

* install node 16+ and npm
* `npm install` from this directory
* generate a keypair to use
  * an example, feel free to change
  * `openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 365 -nodes -subj '/CN=localhost'`
* create env file (see next section)
* run via `DEBUG=* node server.js`
  * can omit the `DEBUG=*` if you dont want it to log anything, but who does that?

### .env file

```
# path to the cert
SERVER_CERT=cert.pem
# path to the private key
SERVER_KEY=key.pem
```