# retroEd — Architecture & Plan

A small, aesthetic Markdown word processor for macOS with a CRT-phosphor or Classic-Mac chrome. Saves plain `.md` to a user-chosen folder; lets the filesystem (e.g. the Proton Drive Mac app) handle sync.

This document is the canonical architectural reference. Skim the Overview and Module Map first; dive into a specific section only when touching that area.

---

## 1. Goals and non-goals

### Goals

- **Files, not databases.** Every document is a plain UTF-8 `.md` on disk. No proprietary format, no sidecar index, no SQLite. The canonical representation is the file.
- **Tiny surface area.** One editor pane, one sidebar, one menu bar, one status bar. No tabs, no panels, no settings pane bigger than a modal.
- **Sync is delegated.** retroEd writes to a folder. Whatever app watches that folder (Proton Drive, iCloud, Dropbox, Syncthing, …) handles upload and encryption.
- **Aesthetic is load-bearing.** The retro look is the product. Themes are first-class.
- **Small binary, quick launch.** Tauri + system WebKit, not Electron.

### Non-goals

- Cloud provider SDK integration. (Originally considered; see §9 Roadmap for why it's deferred.)
- Multi-document editing (tabs, splits).
- Collaborative editing.
- Non-Markdown formats.
- Full WYSIWYG with hidden source. We stop at "Live Preview" — markers hide only when the cursor isn't on that line.
- Windows or Linux support until macOS is polished.

---

## 2. Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                         retroEd.app                           │
│                                                                   │
│   ┌─────────────────────┐        ┌─────────────────────────────┐  │
│   │  Rust host (Tauri)  │<──IPC──│  WebKit webview             │  │
│   │  src-tauri/         │        │  Vite + TypeScript + CM6    │  │
│   │                     │        │  src/                       │  │
│   │  - window config    │        │                             │  │
│   │  - fs commands      │        │  - editor + decorations     │  │
│   │  - dialog plugin    │        │  - chrome (title/menu/...)  │  │
│   │  - store plugin     │        │  - sound synth              │  │
│   └─────────┬───────────┘        └─────────────────────────────┘  │
│             │                                                     │
└─────────────┼─────────────────────────────────────────────────────┘
              │ fs read/write/rename/delete
              v
     ┌────────────────────┐
     │  User-chosen       │
     │  folder (e.g.      │───── Proton Drive Mac app (out of scope)
     │  ~/Library/Cloud-  │      watches, encrypts, uploads
     │  Storage/Proton... │
     │  /writing/)        │
     └────────────────────┘
```

The Rust host owns the window, the filesystem, and the settings store. The webview owns the UI and the text editing engine. They communicate via Tauri's `invoke()` bridge — five commands total (`list_markdown`, `read_doc`, `write_doc`, `create_doc`, `delete_doc`, `rename_doc`).

---

## 3. Process and trust model

- **Rust process** (main): spawns the window, registers plugins, hosts Tauri commands. Untrusted input comes from the webview. Each command validates its own arguments (path escaping, extension checks, empty-name rejection).
- **Webview process**: loads `index.html` from either `http://localhost:1420` (dev) or the bundled `frontendDist` (release). Has no network access — `app.security.csp` is strict and no external origins are used.
- **Capabilities** (`src-tauri/capabilities/default.json`): grants `core:default`, window drag/maximize, dialog, store, fs — nothing else. The fs plugin is enabled but not strictly required since our own Rust commands handle all reads/writes.

---

## 4. Module map

```
src-tauri/
  src/
    main.rs               Thin entry: calls retroed_lib::run()
    lib.rs                All Tauri commands + plugin registration
  capabilities/
    default.json          Permission set granted to the main window
  tauri.conf.json         Window config (size, titleBarStyle, trafficLightPosition, CSP)

src/
  main.ts                 App entry. State singleton, render(), bootstrap, global shortcuts.
  editor/
    editor.ts             CodeMirror setup. Exports mountEditor(). Compartments for editable, wysiwyg.
    markdown-toggle.ts    Pure transforms for ⌘B / ⌘I / ⌘1..3. Also countWords().
    wysiwyg.ts            ViewPlugin that scans the syntax tree and adds Decorations.
  files/
    fs.ts                 invoke() wrappers for the six Tauri filesystem commands.
    store.ts              tauri-plugin-store wrappers for persisted settings.
  sound/
    keyboard.ts           Sample-based click player with WebAudio synth fallback.
    samples/              Bundled CC0 WAVs (click-*.wav, space-*.wav, …).
    samples/README.md     How to add or replace samples.
  styles/
    classic-mac.css       Chrome: title bar, menu bar, sidebar, status bar, modals, context menu.
    crt.css               Editor-body themes: theme-amber, theme-green, theme-mac.
  index.html              Mount point.
```

---

## 5. State

There is one mutable state object: `state` in `src/main.ts`. It holds:

```ts
interface AppState {
  folder:      string | null;         // absolute path, picked on first run
  files:       DocEntry[];            // cached sidebar list; refreshed on save/new/rename/delete
  currentPath: string | null;         // currently-open file (absolute path)
  dirty:       boolean;               // unsaved changes in editor
  words:       number;                // live count from editor
  chars:       number;                // live count from editor
  theme:       "amber"|"green"|"mac"; // editor theme
  wysiwyg:     boolean;               // Live Preview toggle
  keySounds:   boolean;               // mechanical-keyboard toggle
  editor:      EditorHandle | null;   // CodeMirror view wrapper
  saveTimer:   number | null;         // pending autosave
}
```

Every mutation routes through an "action" function (`saveCurrent`, `openFile`, `newFile`, `renameFile`, `closeFile`, `toggleTheme`, etc.) which updates `state` and then calls one of the renderers: `render()` (full), `renderTitleAndStatus()`, `renderSidebarOnly()`, or `renderMenuBarOnly()`.

The persisted subset lives in `tauri-plugin-store` under `settings.json`:

- `folder` — user-picked writing folder
- `lastOpened` — path of the last-opened file (re-opened on next launch)
- `phosphor` — retained key name for `theme`, for backward compatibility
- `wysiwyg` — Live Preview on/off
- `keySounds` — mechanical keyboard on/off

---

## 6. Data flows

### 6.1 First launch

```
bootstrap()
  └─ getTheme() / getWysiwyg() / getKeySounds() / getFolder()
     folder == null ⇒ render() shows splash with "Choose Folder…" button
  pickFolder()
     └─ tauri-plugin-dialog: directory picker
        └─ setFolder(path); refreshFiles(); render()
```

### 6.2 Open a file

```
openFile(path)
  ├─ if dirty → saveCurrent()
  ├─ Rust: read_doc(path)
  ├─ state.currentPath = path; setLastOpened(path)
  ├─ editor.setContent(text)
  └─ render()
```

### 6.3 Type + autosave

```
CodeMirror update listener
  ├─ onChange: state.dirty = true; renderTitleAndStatus()
  └─ scheduleAutosave() → setTimeout(1500ms)
      └─ saveCurrent()
          ├─ Rust: write_doc(path, contents)
          ├─ state.dirty = false
          └─ refreshFiles(); renderSidebarOnly(); renderTitleAndStatus()
```

### 6.4 Rename

```
renameFile(f)
  ├─ if dirty and same file → saveCurrent()
  ├─ promptName() → modal with input, OK/Cancel, Enter/Esc
  ├─ Rust: rename_doc(path, newName)
  │     - validates .md extension, rejects path separators, rejects duplicates
  ├─ if same file open → update state.currentPath, setLastOpened
  └─ refreshFiles(); renderSidebarOnly(); renderTitleAndStatus()
```

### 6.5 Delete

```
showFileContextMenu → Delete…
  ├─ confirm()
  ├─ Rust: delete_doc(path)
  ├─ if same file open → closeFile()
  └─ refreshFiles(); renderSidebarOnly()
```

---

## 7. Editor architecture

### 7.1 CodeMirror 6 wiring

`mountEditor()` creates an `EditorState` with these extensions:

- `history()` — undo/redo
- `drawSelection()`
- `highlightActiveLine()`
- `markdown()` — Lezer grammar + parser
- `syntaxHighlighting(crtHighlight)` — maps lezer tags to class names
- **`shortcutMap`** — custom keymap for ⌘B, ⌘I, ⌘1..3, ⌘S, ⌘O, ⌘N
- `keymap.of([...defaultKeymap, ...historyKeymap])`
- `editableCompartment.of(EditorView.editable.of(true))`
- `wysiwygCompartment.of(initialWysiwyg ? [wysiwygPlugin] : [])`
- `EditorView.lineWrapping`
- `updateCounts` listener — emits `(words, chars)` to the app

Compartments let us flip Live Preview on/off without rebuilding the view, preserving selection and undo history.

### 7.2 Live Preview (`wysiwyg.ts`)

A `ViewPlugin` maintains a `DecorationSet` rebuilt on `docChanged | viewportChanged | selectionSet`. For each visible range it walks the Lezer syntax tree:

| Node              | Decoration                                              |
| :---------------- | :------------------------------------------------------ |
| `ATXHeading{1-6}` | `line` decoration with `md-h md-hN` class               |
| `HeaderMark`      | `replace` (hide `#`s and trailing space) when off-line  |
| `StrongEmphasis`  | `mark` decoration `md-bold`                             |
| `Emphasis`        | `mark` decoration `md-italic`                           |
| `EmphasisMark`    | `replace` when off-line                                 |
| `InlineCode`      | `mark` decoration `md-code`                             |
| `CodeMark`        | `replace` when off-line                                 |
| `Blockquote`      | `line` decoration `md-quote` on each contained line     |
| `QuoteMark`       | `replace` when off-line                                 |
| `HorizontalRule`  | `line` decoration `md-hr` + `replace` when off-line     |
| `Link`            | hide `[…]` brackets + `(url)` when off-line             |
| `Image`           | hide `![…]` brackets + `(url)` when off-line            |

"Off-line" means the decoration's line is not in the set of lines touched by any selection range. This is what gives the Typora-style UX where the line you're editing always shows raw syntax.

Decorations are collected into an array then sorted by `(from, to)` before `Decoration.set(..., true)` because Lezer's DFS traversal does not guarantee the sort order `RangeSetBuilder` requires.

### 7.3 Themes

Three CSS class blocks on `.editor-frame.theme-<name>`:

- `theme-amber` / `theme-green` — black background, phosphor glow (`text-shadow`), pseudo-element `::after` scanlines and `::before` vignette. Cursor block.
- `theme-mac` — white background, black Chicago/Charcoal font, 1-bit selection (inverted), thin I-beam cursor, no scanlines/vignette.

Toggling a theme calls `render()` which remounts the editor pane. The content is re-read from disk (not lost) because `state.currentPath` is preserved.

---

## 7a. Sound subsystem

`src/sound/keyboard.ts` plays a short click per keystroke when the Mechanical Keyboard toggle is on. Everything is WebAudio — no `<audio>` elements.

### Sample loader

At build time, Vite's `import.meta.glob('./samples/click*.wav', { query: '?url', eager: true })` resolves every matching file into a URL. Four glob patterns are read:

| Glob             | Used for                                              |
| :--------------- | :---------------------------------------------------- |
| `click*.wav`     | Regular keys (random pick from the array)             |
| `space*.wav`     | Space bar (falls back to `click*` if empty)           |
| `enter*.wav`     | Return / Enter (falls back to `click*` if empty)      |
| `backspace*.wav` | Backspace / Delete (falls back to `click*` if empty)  |

If *no* samples match any glob, `playKey()` routes to a WebAudio synth fallback — bandpassed noise burst + triangle-wave plate resonance.

### Trim-at-load

Consumer-recorded keyboard WAVs routinely have 100–400 ms of leading silence before the actual strike. To eliminate that as perceived latency, `loadSample()`:

1. Finds peak absolute amplitude across the full decoded buffer.
2. Walks forward for the first sample above 50% of peak — this is the click strike, not noise floor.
3. Backs up 2 ms for rising-edge headroom.
4. Rebuilds a fresh `AudioBuffer` spanning from that point for up to 160 ms — a single click, nothing more.

The cached `LoadedSample` records both the trimmed buffer and the attack offset (for diagnostics). Each trigger just calls `bufferSource.start(0)` — no per-play offset arithmetic.

### Prewarm

Loading + decoding a WAV takes tens to low hundreds of milliseconds the first time. `prewarmKeySounds()` fetches and decodes every bundled sample into the cache ahead of the first keystroke. It runs:

- When the Mechanical Keyboard toggle is turned on.
- At app bootstrap if the toggle was already on (plus a one-shot `pointerdown`/`keydown` fallback because some browsers gate AudioContext creation behind a user gesture).

### Trigger path

For a cached sample, `playKey()` creates the `BufferSourceNode` + `GainNode`, sets playback rate (±12% jitter plus a small per-variant bias) and gain (±18% jitter plus a per-variant bias), connects, and calls `start(0)`. Measured in-app this path runs in well under 3 ms.

### Latency diagnostics

Each cached trigger logs one debug line:

```
[keyboard] trigger 0.8ms (cached) · state=running · baseLatency=2.9ms · outputLatency=21.4ms
```

- `trigger` — our code time from `playKey()` entry to `BufferSourceNode.start()` return.
- `baseLatency` — the audio-graph internal buffer (reported by `AudioContext.baseLatency`).
- `outputLatency` — the handoff buffer to the OS audio driver.

If perceived latency is wildly larger than the sum of these three, the bottleneck is downstream of WebAudio — Bluetooth headphones (AirPods ~200 ms, AirPlay up to 2 s), virtual audio drivers (Zoom's kernel extension can route system audio through its own buffer), or running under `tauri dev` (Vite HMR + unminified bundle add enough overhead to be audible on its own; a release build is the fair comparison).

---

## 8. UI chrome

### 8.1 Title bar

`titleBarStyle: "Overlay"` + `hiddenTitle: true` + `trafficLightPosition: { x: 12, y: 10 }` in `tauri.conf.json`. We draw our own pinstripe title bar behind/around the native traffic lights. Dragging is implemented via `getCurrentWindow().startDragging()` on mousedown (Tauri 2's `data-tauri-drag-region` doesn't fire reliably on macOS). Double-click toggles maximize.

The `core:window:allow-start-dragging` capability is required — it is NOT part of `core:default`.

### 8.2 Menu bar

A plain `<div class="menu-bar">` with four `<div class="menu">` children. Each menu manages its own dropdown via CSS `:hover` / class toggling. Clicking off closes all open menus (delegated `mousedown` listener on `document`). The empty space of the menu bar is also a drag surface.

### 8.3 Sidebar

Lists `*.md` files in the current folder, sorted by mtime descending. Left-click opens, right-click opens a Classic-Mac-styled context menu (Open, Rename…, Delete from Disk…). The `+` button creates `Untitled.md` (auto-numbered if taken).

### 8.4 Status bar

Filename on the left (with ● dirty / ○ saved indicator), word + char count on the right.

### 8.5 Modals

`openModal(title, body)` appends an overlay with a mini Classic Mac window containing a pinstripe title bar, a close box, and the body. Used by:

- Markdown Cheatsheet (⌘/)
- About retroEd
- Rename dialog (`promptName`)

---

## 9. Roadmap

### Shipped (v0.1)

- Tauri + CodeMirror 6 skeleton
- Open / save / create / rename / delete Markdown files, sidebar right-click context menu
- Three themes (CRT amber, CRT green, Classic Mac), ⌘T cycles
- Live Preview toggle (⌘P) with hide-on-off-line syntax markers
- Mechanical keyboard sounds: CC0 sample pack + WebAudio synth fallback, per-keystroke pitch + volume jitter, load-time silence trimming, prewarm on toggle
- Markdown cheatsheet (⌘/)
- Autosave, word count, last-opened restore
- Draggable custom title bar with pinned traffic-light positioning

### Near-term candidates

- **Proper Classic Mac menu interaction** — click-to-open-menu + hover-to-switch (matches real System 6/7 behavior). Currently each menu opens on click but doesn't hover-switch.
- **Font bundling** — ship the ChicagoFLF and IBM Plex Mono webfonts so the look matches on systems without them.
- **Delete → Trash** instead of permanent unlink (use `tauri-plugin-fs` `remove` with `useTrash: true`, or a native macOS `NSFileManager.trashItem` sidecar).
- **Find / Replace** (CodeMirror search extension, ⌘F).
- **Folder watcher** — refresh sidebar automatically when Proton Drive (or any external process) adds/removes files. Uses `notify` crate on the Rust side, emits a Tauri event.
- **Export to PDF / HTML** via a print-style dialog.
- **Recent folders** — sidebar dropdown to switch between multiple writing folders.

### Explicitly deferred

- **Direct Proton Drive SDK integration.** Evaluated and skipped for v0.1. The SDK (`@protontech/drive-sdk@0.0.1`) explicitly ships without auth, session management, or user-address provider — consumers must implement Proton's SRP login, 2FA, captcha handoff, and crypto-proxy layer themselves. The SDK itself is marked "not yet ready for third-party production use." Revisit when (a) the SDK hits 1.x with documentation, or (b) Proton publishes a standalone auth reference. Until then, delegating to the Proton Drive Mac client via a synced folder is functionally identical from the user's perspective and avoids reimplementing encrypted-file plumbing.
- **Windows / Linux support.** Tauri supports them; our CSS and drag code would need audits (e.g., drag region on Windows uses `-webkit-app-region: drag`, which we removed).
- **Mobile.** Tauri supports iOS/Android builds, but the sidebar+editor layout isn't sized for small screens and our CRT vignette looks bad on AMOLED.
- **Rich inline HTML in Live Preview.** Today's preview is all CSS over the source buffer; it can never render, e.g., an actual image inline. Crossing into real HTML rendering would violate the "CodeMirror is the editor" invariant.

### Known sharp edges

- First-run `npm run tauri dev` takes 5–10 minutes to compile Rust. No way around it.
- Autosave debounce is 1.5s. If the user quits immediately after typing, the last 1.5s of work is saved via a `beforeunload` best-effort; a Rust-side flush on window-close would be safer.
- `delete_doc` is permanent. Dangerous; see "Delete → Trash" under near-term.
- Proton Drive sync can conflict with autosave (both processes writing the same file). We currently don't detect conflicts; worst case is a `filename (conflict).md` sibling created by Proton Drive.
- CodeMirror's `execCommand("undo")` fallback used by the Edit menu items is deprecated. Should use CM6's `undo` / `redo` commands directly.
- Mechanical keyboard sound triggers for every global keydown including inside modals — probably fine, but intentional choice to confirm.
- `tauri dev` mode adds real perceptible latency to keyboard sound triggers compared to a release build. Not fixable from our side; always evaluate audio responsiveness against a `tauri build` artifact.

---

## 10. Build & release

### Dev

```bash
source ~/.cargo/env    # if Rust isn't on PATH
npm install
npm run tauri dev
```

### Release

```bash
npm run tauri build
```

Produces `src-tauri/target/release/bundle/dmg/retroEd_0.1.0_aarch64.dmg` (or x64 equivalent). Code signing + notarization are not yet configured — a future `CI.md` will cover that with Apple Developer ID prerequisites.

### Open-source prep done

- `LICENSE` (MIT)
- `README.md` rewritten
- `CONTRIBUTING.md` added
- `package.json` metadata filled in (description, license, keywords, repo placeholders)
- `.gitignore` updated to exclude `src-tauri/target/` and `src-tauri/gen/`

---

## 11. Credits & trademarks

retroEd is an independent project. The Classic Mac look is inspired by Apple's System 6/7 design; "Macintosh" and related visual references are trademarks of Apple Inc.

Font fallbacks rely on Chicago / Charcoal (bundled with classic macOS) and IBM Plex Mono (SIL Open Font License 1.1).
