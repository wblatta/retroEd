use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocEntry {
    pub name: String,
    pub path: String,
    pub modified: u64,
}

fn ensure_md(name: &str) -> String {
    if name.ends_with(".md") {
        name.to_string()
    } else {
        format!("{}.md", name)
    }
}

fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Name cannot be empty".into());
    }
    if name.contains('/') || name.contains('\\') {
        return Err("Name cannot contain path separators".into());
    }
    Ok(())
}

#[tauri::command]
pub fn list_markdown(folder: String) -> Result<Vec<DocEntry>, String> {
    let dir = Path::new(&folder);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", folder));
    }

    let mut entries: Vec<DocEntry> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|res| res.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s == "md")
                .unwrap_or(false)
        })
        .filter_map(|e| {
            let path = e.path();
            let name = path.file_name()?.to_str()?.to_string();
            let modified = e
                .metadata()
                .ok()?
                .modified()
                .ok()?
                .duration_since(UNIX_EPOCH)
                .ok()?
                .as_secs();
            Some(DocEntry {
                name,
                path: path.to_str()?.to_string(),
                modified,
            })
        })
        .collect();

    entries.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(entries)
}

#[tauri::command]
pub fn read_doc(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_doc(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_doc(folder: String, name: String) -> Result<String, String> {
    validate_name(&name)?;
    let base = ensure_md(&name);
    let dir = Path::new(&folder);

    let mut candidate = dir.join(&base);
    if !candidate.exists() {
        fs::write(&candidate, b"").map_err(|e| e.to_string())?;
        return Ok(candidate.to_str().unwrap_or_default().to_string());
    }

    let stem = Path::new(&base)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();

    let mut i = 2u32;
    loop {
        candidate = dir.join(format!("{}-{}.md", stem, i));
        if !candidate.exists() {
            fs::write(&candidate, b"").map_err(|e| e.to_string())?;
            return Ok(candidate.to_str().unwrap_or_default().to_string());
        }
        i += 1;
        if i > 9999 {
            return Err("Could not find a free filename".into());
        }
    }
}

#[tauri::command]
pub fn rename_doc(path: String, new_name: String) -> Result<String, String> {
    validate_name(&new_name)?;
    let new_name = ensure_md(&new_name);

    let old_path = PathBuf::from(&path);
    let parent = old_path
        .parent()
        .ok_or("Cannot determine parent directory")?;
    let new_path = parent.join(&new_name);

    if new_path.exists() && new_path != old_path {
        return Err(format!("A file named '{}' already exists", new_name));
    }

    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
    Ok(new_path.to_str().unwrap_or_default().to_string())
}

#[tauri::command]
pub fn delete_doc(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            list_markdown,
            read_doc,
            write_doc,
            create_doc,
            rename_doc,
            delete_doc,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            app.get_webview_window("main")
                .unwrap()
                .open_devtools();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running retroEd");
}
