// Phase 10.5 — desktop binary entry point.
// All logic lives in lib.rs so mobile + desktop can share it (Tauri's
// recommended pattern for v2).
fn main() {
    appname_desktop_lib::run();
}
