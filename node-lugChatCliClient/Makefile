SIGN_PRIV=private.pem
SIGN_PUB=public.pem

.PHONY: all clean run

# Stub .env file definition
define env_stub
# enter your nickname to be known as
lugchat_nick=linuxUser
# server url to connect to, must start with wss://
lugchat_uri=wss://localhost:8080
# public key
lugchat_pubkey_file=$(SIGN_PUB)
# private key
lugchat_privatekey_file=$(SIGN_PRIV)
endef
export env_stub

.env:
	@echo "$$env_stub" > .env

$(SIGN_PRIV):
	openssl genrsa -out $(SIGN_PRIV) 4096

$(SIGN_PUB): $(SIGN_PRIV)
	openssl rsa -in $(SIGN_PRIV) -pubout -out $(SIGN_PUB)

node_modules: package.json
	npm install

run: $(SIGN_PRIV) $(SIGN_PUB) .env node_modules
	node index.js

all: $(SIGN_PRIV) $(SIGN_PUB) .env

clean:
	${RM} -rf node_modules/