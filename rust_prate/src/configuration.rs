use openssl::{pkey::{PKey, Private}, hash::{hash, MessageDigest}};

#[derive(Clone, Debug)]
pub struct Configuration {
    nick: String,
    key_hex: String,
    pkey: PKey<Private>,
    server_url: String,
}

impl Configuration {
    pub fn new(nick: String, private_key: PKey<Private>, server_url: String) -> Configuration {
        let pub_key = private_key.public_key_to_pem().unwrap();
        let key_hex = hash(MessageDigest::md5(), &pub_key).unwrap();
        let key_hex = hex::encode(key_hex);

        Configuration { 
            nick: String::from(nick),
            key_hex,
            pkey: private_key.to_owned(),
            server_url,
        }
    }

    pub fn get_nick(&self) -> String {
        self.nick.clone()
    }
    pub fn get_key_hex(&self) -> String {
        self.key_hex.clone()
    }
    pub fn get_private_key(&self) -> PKey<Private> {
        self.pkey.clone()
    }
    pub fn get_server_url(&self) -> String {
        self.server_url.clone()
    }
}
