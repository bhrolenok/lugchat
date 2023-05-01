use std::path::Path;
use openssl::{pkey::{PKey, Private}, hash::{hash, MessageDigest}, rsa::Rsa};
use tauri::window::Window;

#[derive(Clone, Debug)]
pub struct Configuration {
    nick: String,
    key_hex: String,
    pkey: PKey<Private>,
    server_url: String,
    window: Window,
}

impl Configuration {
    pub fn new(nick: String, server_url: String, window: Window) -> Configuration {
        let private_key = load_or_generate_private_key();
        let pub_key = private_key.public_key_to_pem().unwrap();
        let key_hex = hash(MessageDigest::md5(), &pub_key).unwrap();
        let key_hex = hex::encode(key_hex);

        Configuration { 
            nick: String::from(nick),
            key_hex,
            pkey: private_key.to_owned(),
            server_url,
            window,
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
    pub fn get_window(&self) -> Window {
        self.window.clone()
    }
}


fn load_or_generate_private_key() -> PKey<Private> {
    let private_pem = Path::new("private.pem");
    let keypair = match std::fs::metadata(private_pem) {
        Ok(_) => {
            let private_pem = std::fs::read_to_string("private.pem").expect("Unable to read the `private.pem` private key file.  Exiting...");
            Rsa::private_key_from_pem(private_pem.as_bytes()).unwrap()
        },
        Err(_) => {
            let pk = Rsa::generate(4096).unwrap();
            std::fs::write(private_pem, pk.private_key_to_pem().unwrap()).ok();
            pk
        },
    };
    PKey::from_rsa(keypair).unwrap()
}
