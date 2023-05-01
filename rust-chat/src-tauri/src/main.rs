// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use configuration::Configuration;
use connection::Connection;
use tauri::Manager;

mod chat_error;
mod configuration;
mod connection;
mod protocol;
mod utils;

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(conf: tauri::State<'_, Configuration>) {
    let window = conf.get_window();
    window.emit("post", serde_json::json!({
        "nick": "???",
        "timestamp": 0,
        "content": "Test message passing from Rust"
    }).to_string());
}

#[tauri::command]
async fn post(connection: tauri::State<'_, Connection>, message: String) -> Result<(), String> {
    match connection.post(message).await {
        Ok(_) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}


fn main() {
    println!("Starting");
    tauri::Builder::default()
        .setup(|app|{
            let main_window = app.get_window("main").unwrap();
            let splash = app.get_window("splashscreen").unwrap();
            // we perform the initialization code on a new task so the app doesn't freeze
            tauri::async_runtime::spawn(async move {

                // Show the splashscreen
                splash.center().unwrap();
                splash.show().unwrap();
                splash.set_focus().unwrap();

                let config = configuration::Configuration::new("rust".into(), "wss://127.0.0.1:8080".into(), main_window.clone());
                let connection = connection::Connection::connect(config.clone()).await;
                if connection.is_err() {
                    tauri::api::dialog::blocking::message(
                        Some(&main_window),
                        "Fatal Error",
                        "Unable to connect to the chat server.  Please try again later.");
                    std::process::exit(0);
                }
                let connection = connection.unwrap();

                // Add our managed state and make the app visible
                main_window.app_handle().manage(config);
                main_window.app_handle().manage(connection);
                splash.close().unwrap();
                main_window.show().unwrap();

                // Continue to load user and historical messages
                main_window.emit("post", serde_json::json!({
                    "nick": "???",
                    "timestamp": 0,
                    "content": "test emit"
                }).to_string())
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, post])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
