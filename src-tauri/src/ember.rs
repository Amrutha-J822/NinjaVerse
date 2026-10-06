//! Ember, the fireball companion, thinks with Nemotron-Mini-4B-Instruct running in Ollama
//! on this computer. This command only passes the prompt along and returns the model's
//! text; the game checks the answer before acting on it.

use serde_json::{json, Value};

const OLLAMA_CHAT: &str = "http://localhost:11434/api/chat";

#[tauri::command]
pub async fn ember_chat(model: String, system: String, user: String) -> Result<String, String> {
    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ],
        "format": "json",
        "stream": false,
        "options": { "temperature": 0.2, "num_predict": 100 }
    });
    let response = reqwest::Client::new()
        .post(OLLAMA_CHAT)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama is not reachable: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Ollama answered {}", response.status()));
    }
    let reply: Value = response.json().await.map_err(|e| e.to_string())?;
    reply["message"]["content"]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| "Ollama sent no message".to_owned())
}
