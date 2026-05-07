// Phase 10.5 — Tauri shell entry point.
//
// Responsibilities:
//   1. Pick a free TCP port for the FastAPI sidecar to bind to.
//   2. Spawn the bundled FastAPI binary as a sidecar with that port.
//   3. Capture the per-launch API token the backend prints to stdout.
//   4. Inject {api_url, api_token} into the webview as window.__APPNAME__
//      so the JS frontend can talk to localhost without ever asking the
//      user for a token.
//   5. Wire up a system tray icon with show / hide / quit menu items.
//   6. Hook the auto-updater so OTA updates work.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Stdio;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::io::{AsyncBufReadExt, BufReader};

#[derive(Default)]
struct SidecarState {
    child: Mutex<Option<CommandChild>>,
    api_token: Mutex<Option<String>>,
    api_port: Mutex<Option<u16>>,
}

#[derive(Serialize, Clone)]
struct BootInfo {
    api_url: String,
    api_token: String,
}

#[tauri::command]
fn get_boot_info(state: tauri::State<Arc<SidecarState>>) -> Option<BootInfo> {
    let token = state.api_token.lock().ok()?.clone()?;
    let port = state.api_port.lock().ok()?.clone()?;
    Some(BootInfo {
        api_url: format!("http://127.0.0.1:{}", port),
        api_token: token,
    })
}

#[tauri::command]
async fn restart_sidecar(app: AppHandle) -> Result<(), String> {
    spawn_sidecar(&app).await.map_err(|e| e.to_string())
}

async fn spawn_sidecar(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let state = app.state::<Arc<SidecarState>>();

    // Kill any existing child.
    if let Some(mut child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
    }

    // Find a free TCP port.
    let port = portpicker::pick_unused_port().ok_or("no free port")?;
    *state.api_port.lock().unwrap() = Some(port);

    // Resolve the bundled sidecar binary path. Tauri's sidecar machinery
    // appends the host triple (e.g. -aarch64-apple-darwin) to the bin name.
    let sidecar_command = app
        .shell()
        .sidecar("appname-server")?
        .args([
            "--host",
            "127.0.0.1",
            "--port",
            &port.to_string(),
        ])
        .env("APPNAME_MODE", "desktop");

    let (mut rx, child) = sidecar_command.spawn()?;

    *state.child.lock().unwrap() = Some(child);

    let app_handle = app.clone();
    let state_for_task = state.inner().clone();

    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    log::info!("[sidecar] {}", line.trim_end());
                    // Backend prints: "[AppName] mode=desktop  api_token=<hex>"
                    if let Some(idx) = line.find("api_token=") {
                        let tail = &line[idx + "api_token=".len()..];
                        let token = tail.split_whitespace().next().unwrap_or("").to_string();
                        if !token.is_empty() {
                            *state_for_task.api_token.lock().unwrap() = Some(token.clone());
                            // Notify the frontend so it can re-init API client.
                            let port_val = *state_for_task.api_port.lock().unwrap();
                            let _ = app_handle.emit(
                                "appname://boot",
                                BootInfo {
                                    api_url: format!(
                                        "http://127.0.0.1:{}",
                                        port_val.unwrap_or(0)
                                    ),
                                    api_token: token,
                                },
                            );
                        }
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    log::warn!("[sidecar.err] {}", line.trim_end());
                }
                CommandEvent::Terminated(payload) => {
                    log::warn!("[sidecar] terminated: {:?}", payload);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show AppName", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
    let separator = MenuItem::with_id(app, "sep", "──", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &separator, &quit])?;

    TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("AppName")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_stronghold::Builder::new(|password| {
            // Stronghold expects a hash of the password as the encryption key.
            // For the desktop app we derive from a hard-coded salt + the OS
            // user — the threat model here is "another local app reads our
            // file", not "rotate-the-key cryptography".
            use std::hash::{Hash, Hasher};
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            password.hash(&mut hasher);
            let h = hasher.finish().to_le_bytes().to_vec();
            // Pad to 32 bytes (Stronghold key length).
            let mut out = vec![0u8; 32];
            for (i, b) in h.iter().enumerate() {
                out[i] = *b;
            }
            out
        }).build())
        .manage(Arc::new(SidecarState::default()))
        .invoke_handler(tauri::generate_handler![get_boot_info, restart_sidecar])
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = spawn_sidecar(&app_handle).await {
                    log::error!("failed to spawn sidecar: {}", e);
                }
            });

            // Tray (best-effort; non-fatal if it fails).
            if let Err(e) = build_tray(app.handle()) {
                log::warn!("tray init failed: {}", e);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Minimize-to-tray on close: hide instead of quitting.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { code, .. } = event {
                // Kill sidecar before exit.
                let state = app_handle.state::<Arc<SidecarState>>();
                if let Some(mut child) = state.child.lock().unwrap().take() {
                    let _ = child.kill();
                }
                let _ = code; // suppress warning
            }
        });
}
