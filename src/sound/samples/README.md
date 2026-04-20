# Keyboard sound samples

Place CC0 or openly-licensed WAV files here. The build picks them up automatically via Vite glob imports.

## Naming convention

| Filename pattern | Used for |
|---|---|
| `click*.wav` | Regular key presses (randomly selected per keystroke) |
| `space*.wav` | Space bar (falls back to click* if absent) |
| `enter*.wav` | Return / Enter (falls back to click* if absent) |
| `backspace*.wav` | Backspace / Delete (falls back to click* if absent) |

## Bundled sample

The recommended sample is [`157766__enok123__keyboard-click.wav`](https://freesound.org/people/enok123/sounds/157766/) by **enok123** on Freesound, released under [Creative Commons 0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain).

Download it and save as `click-1.wav` in this directory.

## Fallback

If no `click*.wav` files are present, the app automatically uses a WebAudio synthesis fallback (bandpassed noise burst + triangle resonance). This is the default behavior when the samples directory is empty.
