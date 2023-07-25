// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{env, sync::Mutex};

use configuration::Configuration;
use connection::Connection;
use protocol::message::{MessageType, UnmappedMessage};
use tauri::{Manager, Window};
use time::{macros::datetime, OffsetDateTime};

mod chat_error;
mod configuration;
mod connection;
mod protocol;
mod utils;

#[derive(Debug, serde::Serialize)]
struct GuiPost {
    nick: String,
    content: String,
    timestamp: i128,
}

struct PostHistory(Mutex<Vec<GuiPost>>);

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(conf: tauri::State<'_, Configuration>) {
    let window = conf.get_window();
    let _ = window.emit("post", serde_json::json!({
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

#[tauri::command]
async fn history(db: tauri::State<'_, PostHistory>, start: u64, end: Option<u64>) -> Result<Vec<String>, String> {
    let mut requested: Vec<String> = Vec::new();
    let posts = db.0.lock().unwrap();
    for post in posts.iter() {
        let end_ts = end.map_or(utc_as_millis!(), |i| i.into());
        if post.timestamp > start.into() && post.timestamp <= end_ts {
            requested.push(serde_json::to_string(post).unwrap().into());
        }
    }
    Ok(requested)
}


fn main() {
    // Configure a global panic intercepter that displays an error to the user and then shutdowns.
    let default_panic = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        default_panic(info);
        tauri::api::dialog::blocking::message(
            None::<&Window>,
            "Exiting",
            "A fatal error was encountered and the application must close."
        );
        std::process::exit(1);
    }));

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
                main_window.app_handle().manage(PostHistory(Default::default()));
                splash.close().unwrap();
                main_window.show().unwrap();

                // Continue to load user and historical messages
                let db: tauri::State<'_, PostHistory> = main_window.state::<PostHistory>();
                let connection = main_window.state::<Connection>();
                let msgs = connection.history(datetime!(1970-01-01 0:00 UTC), Some(OffsetDateTime::now_utc())).await.unwrap();
                for value in msgs.content["msgList"].as_array().unwrap().iter() {
                    // Convert to JSON and back into an object because we cannot borrow/take ownership to convert
                    let raw = serde_json::to_string(value).unwrap();
                    let envelope: protocol::envelope::SignedEnvelope = serde_json::from_str(raw.as_str()).unwrap();

                    if envelope.is_client_message() {
                        let msg: UnmappedMessage = envelope.into();
                        if msg.msg_type == MessageType::Post {
                            let content: String = msg.get_content_str("postContent".into()).unwrap_or("").into();
                            {
                                let mut posts = db.0.lock().unwrap();
                                posts.push(GuiPost { nick: msg.nick.clone(), content: content.into(), timestamp: utc_as_millis!(msg.time) });
                                posts.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
                            }
                        }
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, history, post])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { .. } => {
                app.state::<Connection>().signal_close();
            }
            _ => {}
        });
}
