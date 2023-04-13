TLS_CERT=cert.pem
TLS_KEY=key.pem
SIGN_PRIV=private.pem
SIGN_PUB=public.pem

.PHONY: all clean run

# Stub .env file definition
define env_stub
SERVER_CERT=$(TLS_CERT)
# path to the private key
SERVER_KEY=$(TLS_KEY)
# key used to sign message responses
SIGNING_PRIVATE_KEY=$(SIGN_PRIV)
# public key (pair of the private key) for verifying
SIGNING_PUBLIC_KEY=$(SIGN_PUB)
endef
export env_stub

.env:
	@echo "$$env_stub" > .env

$(TLS_CERT):
	openssl req -x509 -newkey rsa:4096 -keyout $(TLS_KEY) -out $(TLS_CERT) -sha256 -days 365 -nodes -subj '/CN=localhost'

$(SIGN_PRIV):
	openssl genrsa -out $(SIGN_PRIV) 4096

$(SIGN_PUB): $(SIGN_PRIV)
	openssl rsa -in $(SIGN_PRIV) -pubout -out $(SIGN_PUB)

run: $(TLS_CERT) $(SIGN_PRIV) $(SIGN_PUB) .env
	DEBUG=* node server.js

all: $(TLS_CERT) $(SIGN_PRIV) $(SIGN_PUB) .env

clean:
	${RM} -rf node_modules/