import { invoke } from "@tauri-apps/api/core";

export interface DocEntry {
  name: string;
  path: string;
  modified: number;
}

export function listMarkdown(folder: string): Promise<DocEntry[]> {
  return invoke("list_markdown", { folder });
}

export function readDoc(path: string): Promise<string> {
  return invoke("read_doc", { path });
}

export function writeDoc(path: string, content: string): Promise<void> {
  return invoke("write_doc", { path, content });
}

export function createDoc(folder: string, name: string): Promise<string> {
  return invoke("create_doc", { folder, name });
}

export function renameDoc(path: string, newName: string): Promise<string> {
  return invoke("rename_doc", { path, newName });
}

export function deleteDoc(path: string): Promise<void> {
  return invoke("delete_doc", { path });
}
