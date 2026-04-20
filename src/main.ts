import "./styles/classic-mac.css";
import "./styles/crt.css";

import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  DocEntry,
  listMarkdown,
  readDoc,
  writeDoc,
  createDoc,
  renameDoc,
  deleteDoc,
} from "./files/fs";
import {
  getFolder,
  setFolder,
  getLastOpened,
  setLastOpened,
  getTheme,
  setTheme,
  getWysiwyg,
  setWysiwyg,
  getKeySounds,
  setKeySounds,
} from "./files/store";
import { mountEditor, EditorHandle } from "./editor/editor";
import { prewarmKeySounds, playKey } from "./sound/keyboard";

interface AppState {
  folder: string | null;
  files: DocEntry[];
  currentPath: string | null;
  dirty: boolean;
  words: number;
  chars: number;
  theme: "amber" | "green" | "mac";
  wysiwyg: boolean;
  keySounds: boolean;
  editor: EditorHandle | null;
  saveTimer: number | null;
}

const state: AppState = {
  folder: null,
  files: [],
  currentPath: null,
  dirty: false,
  words: 0,
  chars: 0,
  theme: "amber",
  wysiwyg: true,
  keySounds: false,
  editor: null,
  saveTimer: null,
};

// ── Persistence helpers ────────────────────────────────────────────────────

async function refreshFiles(): Promise<void> {
  if (!state.folder) return;
  state.files = await listMarkdown(state.folder);
}

// ── Autosave ───────────────────────────────────────────────────────────────

function scheduleAutosave(): void {
  if (state.saveTimer !== null) clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(() => {
    state.saveTimer = null;
    saveCurrent();
  }, 1500);
}

// ── Actions ────────────────────────────────────────────────────────────────

async function saveCurrent(): Promise<void> {
  if (!state.currentPath || !state.editor) return;
  const content = state.editor.getContent();
  await writeDoc(state.currentPath, content);
  state.dirty = false;
  await refreshFiles();
  renderSidebarOnly();
  renderTitleAndStatus();
}

async function openFile(path: string): Promise<void> {
  if (state.dirty) await saveCurrent();
  const text = await readDoc(path);
  state.currentPath = path;
  await setLastOpened(path);
  if (state.editor) {
    state.editor.setContent(text);
  } else {
    renderEditor();
  }
  state.dirty = false;
  renderTitleAndStatus();
  renderSidebarOnly();
}

async function newFile(): Promise<void> {
  if (!state.folder) return;
  if (state.dirty) await saveCurrent();
  const path = await createDoc(state.folder, "Untitled.md");
  await refreshFiles();
  await openFile(path);
}

async function renameFile(entry: DocEntry): Promise<void> {
  if (state.dirty && state.currentPath === entry.path) await saveCurrent();
  const newName = await promptName(entry.name.replace(/\.md$/, ""));
  if (!newName) return;
  const newPath = await renameDoc(entry.path, newName);
  if (state.currentPath === entry.path) {
    state.currentPath = newPath;
    await setLastOpened(newPath);
  }
  await refreshFiles();
  renderSidebarOnly();
  renderTitleAndStatus();
}

async function deleteFile(entry: DocEntry): Promise<void> {
  const ok = await confirmDialog(
    `Delete "${entry.name}" from disk? This cannot be undone.`
  );
  if (!ok) return;
  await deleteDoc(entry.path);
  if (state.currentPath === entry.path) closeFile();
  await refreshFiles();
  renderSidebarOnly();
}

function closeFile(): void {
  state.currentPath = null;
  state.dirty = false;
  if (state.editor) {
    state.editor.setContent("");
    state.editor.setEditable(false);
  }
  renderTitleAndStatus();
}

function toggleTheme(): void {
  const order: Array<"amber" | "green" | "mac"> = ["amber", "green", "mac"];
  const next = order[(order.indexOf(state.theme) + 1) % order.length];
  state.theme = next;
  setTheme(next);
  render();
}

function toggleWysiwyg(): void {
  state.wysiwyg = !state.wysiwyg;
  setWysiwyg(state.wysiwyg);
  if (state.editor) state.editor.setWysiwyg(state.wysiwyg);
  renderMenuBarOnly();
}

async function toggleKeySounds(): Promise<void> {
  state.keySounds = !state.keySounds;
  await setKeySounds(state.keySounds);
  if (state.keySounds) await prewarmKeySounds();
  renderMenuBarOnly();
}

async function pickFolder(): Promise<void> {
  const selected = await open({ directory: true, multiple: false });
  if (!selected || typeof selected !== "string") return;
  state.folder = selected;
  await setFolder(selected);
  await refreshFiles();
  render();
  const lastOpened = await getLastOpened();
  if (lastOpened && state.files.some((f) => f.path === lastOpened)) {
    await openFile(lastOpened);
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  state.theme = await getTheme();
  state.wysiwyg = await getWysiwyg();
  state.keySounds = await getKeySounds();
  state.folder = await getFolder();

  if (state.folder) {
    await refreshFiles();
  }

  render();

  if (state.folder) {
    const lastOpened = await getLastOpened();
    if (lastOpened && state.files.some((f) => f.path === lastOpened)) {
      await openFile(lastOpened);
    }
  }

  if (state.keySounds) {
    const onUserGesture = async () => {
      await prewarmKeySounds();
      document.removeEventListener("pointerdown", onUserGesture);
      document.removeEventListener("keydown", onUserGesture as EventListener);
    };
    document.addEventListener("pointerdown", onUserGesture);
    document.addEventListener("keydown", onUserGesture as EventListener);
    prewarmKeySounds();
  }

  // Global keyboard shortcuts
  document.addEventListener("keydown", async (e) => {
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;

    if (e.key === "n") { e.preventDefault(); await newFile(); }
    else if (e.key === "o") { e.preventDefault(); await pickFolder(); }
    else if (e.key === "s") { e.preventDefault(); await saveCurrent(); }
    else if (e.key === "t") { e.preventDefault(); toggleTheme(); }
    else if (e.key === "p") { e.preventDefault(); toggleWysiwyg(); }
    else if (e.key === "/") { e.preventDefault(); showCheatsheet(); }
  });

  // Autosave before window close
  window.addEventListener("beforeunload", () => {
    if (state.dirty && state.currentPath && state.editor) {
      writeDoc(state.currentPath, state.editor.getContent());
    }
  });

  // Sound on every keydown
  document.addEventListener("keydown", (e) => {
    if (state.keySounds) playKey(e.key);
  });

  // Setup window dragging
  const appEl = document.getElementById("app");
  if (appEl) {
    appEl.addEventListener("mousedown", async (e) => {
      const target = e.target as HTMLElement;
      if (
        target.classList.contains("title-bar") ||
        target.classList.contains("menu-bar") ||
        target.classList.contains("menu-bar-spacer")
      ) {
        await getCurrentWindow().startDragging();
      }
    });
    appEl.addEventListener("dblclick", async (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("title-bar")) {
        await getCurrentWindow().toggleMaximize();
      }
    });
  }
}

// ── Render helpers ─────────────────────────────────────────────────────────

function renderEditor(): void {
  const frame = document.querySelector(".editor-frame") as HTMLElement | null;
  if (!frame) return;
  frame.innerHTML = "";

  if (!state.currentPath) {
    frame.innerHTML = '<div class="editor-placeholder">Open or create a file to start editing.</div>';
    state.editor = null;
    return;
  }

  state.editor = mountEditor(frame, {
    content: "",
    wysiwyg: state.wysiwyg,
    onChange(words, chars) {
      state.words = words;
      state.chars = chars;
      state.dirty = true;
      renderTitleAndStatus();
      scheduleAutosave();
    },
    onSave: saveCurrent,
    onNew: newFile,
  });
}

function renderTitleAndStatus(): void {
  const titleEl = document.querySelector(".title-bar-text");
  const statusEl = document.querySelector(".status-bar");
  if (!titleEl || !statusEl) return;

  const name = state.currentPath
    ? state.currentPath.split("/").pop() ?? ""
    : "retroEd";
  titleEl.textContent = (state.dirty ? "● " : "") + name;

  if (state.currentPath) {
    const fileName = state.currentPath.split("/").pop() ?? "";
    statusEl.innerHTML = `
      <span class="status-file">${state.dirty ? "●" : "○"} ${fileName}</span>
      <span class="status-counts">${state.words} words · ${state.chars} chars</span>
    `;
  } else {
    statusEl.innerHTML = `<span class="status-file"></span><span class="status-counts"></span>`;
  }
}

function renderSidebarOnly(): void {
  const sidebar = document.querySelector(".sidebar-list");
  if (!sidebar) return;
  sidebar.innerHTML = "";
  for (const entry of state.files) {
    const li = document.createElement("li");
    li.className = "sidebar-item" + (entry.path === state.currentPath ? " active" : "");
    li.textContent = entry.name.replace(/\.md$/, "");
    li.addEventListener("click", () => openFile(entry.path));
    li.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, entry);
    });
    sidebar.appendChild(li);
  }
}

function renderMenuBarOnly(): void {
  const previewItem = document.querySelector('[data-action="toggle-preview"]');
  const soundItem = document.querySelector('[data-action="toggle-sounds"]');
  if (previewItem) {
    previewItem.textContent = `Live Preview ${state.wysiwyg ? "✓" : ""}  ⌘P`;
  }
  if (soundItem) {
    soundItem.textContent = `Key Sounds ${state.keySounds ? "✓" : ""}`;
  }
}

// ── Full render ────────────────────────────────────────────────────────────

function render(): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.className = `app theme-${state.theme}`;

  if (!state.folder) {
    app.innerHTML = splashHTML();
    document.querySelector(".btn-pick-folder")?.addEventListener("click", pickFolder);
    return;
  }

  app.innerHTML = appShellHTML();

  // Wire menu items
  wireMenuBar();

  // Render sidebar
  renderSidebarOnly();

  // New file button
  document.querySelector(".sidebar-new-btn")?.addEventListener("click", newFile);

  // Editor area
  renderEditor();

  // Re-populate editor content if file is open
  if (state.currentPath && state.editor) {
    readDoc(state.currentPath).then((text) => {
      state.editor!.setContent(text);
      state.dirty = false;
    });
  }

  renderTitleAndStatus();
  renderMenuBarOnly();

  // Close context menu on click outside
  document.addEventListener("mousedown", closeContextMenus, { capture: true });
  // Close dropdown menus on click outside
  document.addEventListener("mousedown", closeDropdowns);
}

// ── HTML templates ─────────────────────────────────────────────────────────

function splashHTML(): string {
  return `
    <div class="splash">
      <div class="splash-logo">retroEd</div>
      <p class="splash-sub">A Markdown word processor with a CRT-phosphor soul.</p>
      <button class="btn btn-pick-folder">Choose Folder…</button>
    </div>
  `;
}

function appShellHTML(): string {
  return `
    <div class="title-bar">
      <span class="title-bar-text">retroEd</span>
    </div>
    <div class="menu-bar">
      ${menuHTML("File", [
        { label: "New  ⌘N", action: "new-file" },
        { label: "Open Folder…  ⌘O", action: "open-folder" },
        { label: "Save  ⌘S", action: "save" },
        { label: "separator", action: "" },
        { label: "Close", action: "close-file" },
      ])}
      ${menuHTML("Edit", [
        { label: "Undo  ⌘Z", action: "undo" },
        { label: "Redo  ⇧⌘Z", action: "redo" },
        { label: "separator", action: "" },
        { label: "Bold  ⌘B", action: "bold" },
        { label: "Italic  ⌘I", action: "italic" },
        { label: "separator", action: "" },
        { label: "Heading 1  ⌘1", action: "h1" },
        { label: "Heading 2  ⌘2", action: "h2" },
        { label: "Heading 3  ⌘3", action: "h3" },
      ])}
      ${menuHTML("View", [
        { label: "Live Preview  ⌘P", action: "toggle-preview" },
        { label: "Cycle Theme  ⌘T", action: "toggle-theme" },
        { label: "separator", action: "" },
        { label: "Key Sounds", action: "toggle-sounds" },
      ])}
      ${menuHTML("Help", [
        { label: "Markdown Cheatsheet  ⌘/", action: "cheatsheet" },
        { label: "separator", action: "" },
        { label: "About retroEd", action: "about" },
      ])}
      <div class="menu-bar-spacer"></div>
    </div>
    <div class="workspace">
      <div class="sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">Documents</span>
          <button class="sidebar-new-btn" title="New document">+</button>
        </div>
        <ul class="sidebar-list"></ul>
      </div>
      <div class="editor-area">
        <div class="editor-frame theme-${state.theme}"></div>
      </div>
    </div>
    <div class="status-bar"></div>
  `;
}

function menuHTML(label: string, items: Array<{ label: string; action: string }>): string {
  const itemsHTML = items
    .map((item) => {
      if (item.label === "separator") return `<li class="menu-sep"></li>`;
      return `<li class="menu-item" data-action="${item.action}">${item.label}</li>`;
    })
    .join("");
  return `
    <div class="menu">
      <span class="menu-label">${label}</span>
      <ul class="menu-dropdown">${itemsHTML}</ul>
    </div>
  `;
}

function wireMenuBar(): void {
  // Toggle open/close on click
  document.querySelectorAll(".menu").forEach((menu) => {
    menu.querySelector(".menu-label")?.addEventListener("click", () => {
      const isOpen = menu.classList.contains("open");
      document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
      if (!isOpen) menu.classList.add("open");
    });
    // Hover-switch: if another menu is open, switch to this one on hover
    menu.addEventListener("mouseenter", () => {
      const anyOpen = document.querySelector(".menu.open");
      if (anyOpen && anyOpen !== menu) {
        anyOpen.classList.remove("open");
        menu.classList.add("open");
      }
    });
  });

  document.querySelectorAll(".menu-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      const action = (e.currentTarget as HTMLElement).dataset.action ?? "";
      handleMenuAction(action);
      closeDropdowns();
    });
  });
}

function closeDropdowns(): void {
  document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
}

async function handleMenuAction(action: string): Promise<void> {
  switch (action) {
    case "new-file": await newFile(); break;
    case "open-folder": await pickFolder(); break;
    case "save": await saveCurrent(); break;
    case "close-file": closeFile(); break;
    case "undo": document.execCommand("undo"); break;
    case "redo": document.execCommand("redo"); break;
    case "bold":
      if (state.editor) {
        const { toggleBold } = await import("./editor/markdown-toggle");
        toggleBold(state.editor.view);
      }
      break;
    case "italic":
      if (state.editor) {
        const { toggleItalic } = await import("./editor/markdown-toggle");
        toggleItalic(state.editor.view);
      }
      break;
    case "h1":
      if (state.editor) {
        const { toggleHeading } = await import("./editor/markdown-toggle");
        toggleHeading(state.editor.view, 1);
      }
      break;
    case "h2":
      if (state.editor) {
        const { toggleHeading } = await import("./editor/markdown-toggle");
        toggleHeading(state.editor.view, 2);
      }
      break;
    case "h3":
      if (state.editor) {
        const { toggleHeading } = await import("./editor/markdown-toggle");
        toggleHeading(state.editor.view, 3);
      }
      break;
    case "toggle-preview": toggleWysiwyg(); break;
    case "toggle-theme": toggleTheme(); break;
    case "toggle-sounds": await toggleKeySounds(); break;
    case "cheatsheet": showCheatsheet(); break;
    case "about": showAbout(); break;
  }
}

// ── Context menu ───────────────────────────────────────────────────────────

function showContextMenu(x: number, y: number, entry: DocEntry): void {
  closeContextMenus();
  const menu = document.createElement("ul");
  menu.className = "context-menu";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const items: Array<{ label: string; action: () => void }> = [
    { label: "Open", action: () => openFile(entry.path) },
    { label: "Rename…", action: () => renameFile(entry) },
    { label: "Delete from Disk…", action: () => deleteFile(entry) },
  ];

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "context-menu-item";
    li.textContent = item.label;
    li.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      closeContextMenus();
      item.action();
    });
    menu.appendChild(li);
  }

  document.body.appendChild(menu);
}

function closeContextMenus(): void {
  document.querySelectorAll(".context-menu").forEach((el) => el.remove());
}

// ── Modals ─────────────────────────────────────────────────────────────────

function openModal(title: string, bodyHTML: string): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-window">
      <div class="modal-title-bar">
        <button class="modal-close-box" aria-label="Close">■</button>
        <span class="modal-title">${title}</span>
      </div>
      <div class="modal-body">${bodyHTML}</div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector(".modal-close-box")?.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") overlay.remove();
    },
    { once: true }
  );

  return overlay;
}

async function promptName(current: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = openModal("Rename", `
      <form class="rename-form">
        <input class="rename-input" type="text" value="${current}" />
        <div class="modal-buttons">
          <button type="button" class="btn btn-cancel">Cancel</button>
          <button type="submit" class="btn btn-ok">OK</button>
        </div>
      </form>
    `);

    const input = overlay.querySelector(".rename-input") as HTMLInputElement;
    input.focus();
    input.select();

    overlay.querySelector(".btn-cancel")?.addEventListener("click", () => {
      overlay.remove();
      resolve(null);
    });

    overlay.querySelector(".rename-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = input.value.trim();
      overlay.remove();
      resolve(val || null);
    });
  });
}

async function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = openModal("Confirm", `
      <p>${message}</p>
      <div class="modal-buttons">
        <button class="btn btn-cancel">Cancel</button>
        <button class="btn btn-ok btn-danger">Delete</button>
      </div>
    `);

    overlay.querySelector(".btn-cancel")?.addEventListener("click", () => {
      overlay.remove();
      resolve(false);
    });
    overlay.querySelector(".btn-danger")?.addEventListener("click", () => {
      overlay.remove();
      resolve(true);
    });
  });
}

function showCheatsheet(): void {
  openModal("Markdown Cheatsheet", `
    <table class="cheatsheet-table">
      <tr><td><code># Heading 1</code></td><td>H1</td></tr>
      <tr><td><code>## Heading 2</code></td><td>H2</td></tr>
      <tr><td><code>### Heading 3</code></td><td>H3</td></tr>
      <tr><td><code>**bold**</code></td><td><strong>bold</strong></td></tr>
      <tr><td><code>*italic*</code></td><td><em>italic</em></td></tr>
      <tr><td><code>\`code\`</code></td><td><code>code</code></td></tr>
      <tr><td><code>> blockquote</code></td><td>Quote</td></tr>
      <tr><td><code>- item</code></td><td>List</td></tr>
      <tr><td><code>1. item</code></td><td>Ordered list</td></tr>
      <tr><td><code>[text](url)</code></td><td>Link</td></tr>
      <tr><td><code>![alt](url)</code></td><td>Image</td></tr>
      <tr><td><code>---</code></td><td>Horizontal rule</td></tr>
    </table>
    <div class="cheatsheet-shortcuts">
      <strong>Shortcuts:</strong> ⌘B Bold · ⌘I Italic · ⌘1-3 Headings · ⌘T Theme · ⌘P Preview
    </div>
  `);
}

function showAbout(): void {
  openModal("About retroEd", `
    <div class="about-body">
      <p><strong>retroEd</strong> v0.1.0</p>
      <p>A tiny, aesthetic Markdown word processor for macOS.</p>
      <p>MIT License · <a href="https://github.com/wblatta/retroEd">github.com/wblatta/retroEd</a></p>
    </div>
  `);
}

// ── Entry point ────────────────────────────────────────────────────────────

bootstrap().catch(console.error);
