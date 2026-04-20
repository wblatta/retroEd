# Contributing to retroEd

Thanks for considering a contribution.

## Dev setup

Install prerequisites:

- Node.js 18+
- Rust (via [rustup](https://rustup.rs/))

Clone and run:

```bash
git clone https://github.com/wblatta/retroEd.git
cd retroEd
npm install
npm run tauri dev
```

The first `tauri dev` takes several minutes as Rust compiles. Subsequent runs are fast — the webview uses Vite HMR, and Rust only rebuilds when you touch `src-tauri/`.

## Before you push

```bash
npx tsc --noEmit           # TypeScript type-check
(cd src-tauri && cargo check)
```

## Scope guidelines

retroEd tries to stay small. Before opening a PR for a new feature, please open an issue first so we can discuss whether it fits. Things that generally do *not* belong:

- Cloud service integrations (retroEd intentionally treats sync as the filesystem's job)
- Non-Markdown formats
- Collaborative editing
- Heavyweight WYSIWYG (we have Live Preview, which is the deliberate ceiling)

Things that generally *do* belong:

- New themes (CRT monochrome variants, other vintage computer looks)
- Subtle UI polish and accessibility
- Performance improvements in the editor or Live Preview decoration pass
- Bug fixes
- Documentation

## Style

- No emoji in source files unless they render as UI glyphs.
- Prefer editing existing files over creating new ones.
- One short comment explaining *why* a non-obvious bit exists is worth more than a doc block describing *what*.
- TypeScript strict mode; no `any` unless bridging an actual JS untyped boundary.

## Licensing

By contributing, you agree that your contributions will be licensed under the MIT License.
