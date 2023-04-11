# Node Client CLI

## Getting started

* install node 16+ and npm
* `npm install` from this directory
* generate a keypair to use
  * `openssl genrsa -out private.pem 4096`
  * `openssl rsa -in private.pem -pubout -out public.pem`
* create .env file (see next section)
* run via `node index.js`

### .env file

TODO: interactive piece to have it collect and save the fields for you!

```
# enter your nickname to be known as
lugchat_nick=linuxUser
# server url to connect to, must start with wss://
lugchat_uri=wss://localhost:8080
# public key
lugchat_pubkey_file=
# private key
lugchat_privatekey_file=
```