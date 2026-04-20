# retroProton

A tiny, aesthetic Markdown word processor for macOS with a CRT-phosphor soul and a Classic Mac chrome. Saves plain `.md` files in a folder you pick — put that folder inside your Proton Drive (or any other sync service) and your documents sync automatically.

```
  ┌─────────────────────────────────────────────────┐
  │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ retroProton ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀  │
  │  File  Edit  Format  View  Help                 │
  ├────────────┬────────────────────────────────────┤
  │ Documents+ │                                    │
  │            │   # Hello, world                   │
  │ Notes      │                                    │
  │ Draft      │   The cursor blinks like it's      │
  │ Journal    │   1987 again.                      │
  │            │                                    │
  └────────────┴────────────────────────────────────┘
```

## Why

Modern word processors are overwhelming. Plain Markdown editors are bland. retroProton lands in between: real file-on-disk Markdown (no lock-in, no proprietary format) rendered through a deliberately playful retro UI.

## Features

- **Three themes**: CRT Amber phosphor, CRT Green phosphor, and Classic Mac (Chicago-font, 1-bit black & white). ⌘T cycles.
- **Live Preview**: Obsidian/Typora-style hybrid — markers hide on lines you aren't editing, so `**bold**` looks bold while you write. ⌘P toggles.
- **Mechanical keyboard sounds**: bundled CC0 click sample with per-keystroke pitch and volume variation; falls back to a WebAudio synth if no samples are installed.
- **File sidebar**: sorted by modified time; right-click for Open / Rename… / Delete from Disk.
- **Markdown Cheatsheet** built in (⌘/).
- **Autosave** debounced at 1.5s.
- **Plain Markdown on disk** — edit in any other tool; back up anywhere; sync via any folder-sync provider (Proton Drive, Dropbox, iCloud Drive, Syncthing, etc.).
- **Small release binary** via Tauri 2 + system WebKit (no Chromium shipped).

## Keyboard shortcuts

| Shortcut | Action                    |
| :------- | :------------------------ |
| ⌘N       | New document              |
| ⌘O       | Open document…            |
| ⌘S       | Save                      |
| ⌘B / ⌘I  | Bold / Italic             |
| ⌘1 … ⌘3  | Heading 1–3               |
| ⌘Z / ⇧⌘Z | Undo / Redo               |
| ⌘T       | Cycle theme               |
| ⌘P       | Toggle Live Preview       |
| ⌘/       | Markdown Cheatsheet       |

## Requirements

- macOS (Apple Silicon or Intel)
- Node.js 18+
- Rust (install via [rustup](https://rustup.rs/))

## Run from source

```bash
git clone https://github.com/YOUR-HANDLE/retroProton.git
cd retroProton
npm install
npm run tauri dev
```

## Build a standalone app

```bash
npm run tauri build
```

The `.app` and `.dmg` land in `src-tauri/target/release/bundle/`. The release build is noticeably snappier than `tauri dev` — if you're testing the mechanical-keyboard latency or general responsiveness, build a release first.

Code signing and notarization are not yet configured; you'll see a Gatekeeper warning on first launch until you add a Developer ID cert.

## How documents are stored

retroProton writes UTF-8 `.md` files to a folder you pick on first launch. It does **not** talk to Proton Drive directly — the official Proton Drive Mac client watches its own sync folder and handles encryption + upload. Pick any subfolder inside that sync location (for example, `~/Library/CloudStorage/ProtonDrive-<acct>/writing/`) and retroProton drops plain Markdown files there.

If you don't use Proton Drive, any other folder works the same way: Dropbox, iCloud Drive, Syncthing, a local disk, whatever.

## Tech stack

- [Tauri 2](https://tauri.app/) — Rust host, system WebKit webview, signed `.app`/`.dmg` output
- [CodeMirror 6](https://codemirror.net/) — the editor
- Vanilla TypeScript — the rest
- WebAudio synthesis — the mechanical-keyboard click sounds

## Project layout

```
src-tauri/           Rust host: window config, filesystem commands, plugins
src/editor/          CodeMirror setup, Live Preview decorations, Markdown toggles
src/files/           Tauri-command wrappers, settings store
src/sound/           Mechanical keyboard sample loader + synth fallback
src/sound/samples/   Bundled CC0 key-click WAVs (rotated per keystroke)
src/styles/          Classic Mac chrome + CRT theme CSS
src/main.ts          Entry: state, actions, render, bootstrap
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed walkthrough of the state shape, data flows, editor decorations, and the sound subsystem.

## Contributing

Issues and PRs welcome. Please:
1. Run `npx tsc --noEmit` before submitting.
2. Match the existing code style — no emoji in source unless you're genuinely adding UI glyphs.
3. Don't add dependencies without a clear reason.

See [CONTRIBUTING.md](CONTRIBUTING.md) for more.

## Credits

Bundled keyboard-click sample is [`157766__enok123__keyboard-click.wav`](https://freesound.org/people/enok123/sounds/157766/) by **enok123** on Freesound, released under [Creative Commons 0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain). No attribution required, but thanks anyway.

## License

MIT — see [LICENSE](LICENSE).

retroProton is not affiliated with Proton AG. "Proton Drive" is a trademark of Proton AG.
