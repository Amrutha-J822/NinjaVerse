#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod decision_generator;

#[tauri::command]
fn jarvis_decision(level: String) -> String {
  // Placeholder for Nemotron-Mini-4B-Instruct inference.
  // Returns JSON with building coordinates, villain energy, attack, etc.
  decision_generator::generate_decisions(&level)
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![jarvis_decision])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
