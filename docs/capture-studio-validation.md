# Capture studio validation — October 14, 2026

The editor Voice / ElevenLabs workflow has been installed and exercised on this Apple Silicon Mac. The broader physical-device acceptance pass is not complete.

## Build and automated checks

- TypeScript (`tsc --noEmit`) passes.
- Full Vitest suite: **1,123 tests in 127 files**. The final source-picker error presentation also passed TypeScript and the production build.
- Biome lint: no errors; 20 existing warnings elsewhere in the project. Locale structural consistency and `git diff --check` pass.
- Production renderer/main/preload builds, CommonJS smoke, packaged ASAR manifest/content checks and packaged executable/FFmpeg/native-helper/Whisper checks pass.
- ScreenCaptureKit helper compiled for Apple Silicon and Intel. The Apple Silicon package passes `codesign --verify --deep --strict` and is installed at `/Applications/MistaRecorda.app`. Previous installed copies are recoverable in Trash. The installed local build uses the persistent MistaRecorda Local Development certificate and is not notarized; public distribution still needs Developer ID signing/notarization.
- Tests cover zoom hold/tap/pause/stop modes, imported sound timing and validation, window-switch coordinate mapping, microphone-only conversion and original preservation, preset validation, media approval restoration, companion authorization, and bounded/cached microphone-device enumeration when the recorder is hidden.

## Live editor / ElevenLabs verification

- Opened the user's saved 52-second window take in the editor and used the new **Voice / ElevenLabs** rail entry. The panel identifies the current take and exposes voice selection, tuning, preset tools, conversion and original/changed microphone selection.
- Real ElevenLabs voice enumeration and audition succeeded with the user's encrypted key. No key is included in presets or source files.
- Converted an 8.36-second synthetic spoken microphone sample through the real ElevenLabs service. An initial format-tier denial was fixed: explicit PCM format denials now fall back to supported MP3 formats; unrelated voice/plan denials are not retried.
- Selected **Changed voice** in the editor, played the take, and exported through the normal UI. The export is `~/Downloads/MistaRecorda-ElevenLabs-voice-test.mp4` (1280 × 720 H.264 with 48 kHz AAC). Decoded export audio correlates 0.99995 with the changed microphone waveform and -0.0041 with the original, confirming the chosen audio reached the export. Original microphone audio remains intact.
- Saved and reopened `QA ElevenLabs editor export.recordly`. The changed microphone selection persisted. The final installed build also completed a second conversion through the current-take **Change voice again** button; switching back to **Original** and then **Changed voice** worked.
- Exercised tuning persistence, restored the original stability value (0.5), opened the preset editor, and exported `~/Downloads/MistaRecorda-George-editor-test.mpvoice`. It contains a voice reference/settings and no credential fields. Earlier real export/import produced the reusable `QA Imported George` preset.
- Visual inspection found and removed old duplicate controls overlapping the project title. The final installed sidebar was visually inspected with a fresh take.

## Live native capture and export verification

- macOS logs identified stale ad-hoc code requirements for Screen Recording, Accessibility and Microphone. With the user's explicit approval, only MistaRecorda's three grants were reset/refreshed. No reboot, Full Disk Access, sudoers change or global privacy reset was used. The October 14 follow-up installed a persistent local signing identity with explicit user approval; see below.
- A 52.2-second native window take succeeded at 2984 × 1708, roughly 58 fps, with microphone-only inline audio. A sampled raw frame showed the selected Chrome window without MistaRecorda controls or replacement boxes. Its known microphone-only audio was recovered into an isolated track for this QA take; arbitrary mixed audio is not treated as microphone audio.
- That test exposed a hidden-window startup stall caused by device enumeration after hiding controls. Device discovery now happens before hiding, with a bounded cache fallback. Native microphone-only capture now always writes a separate microphone track.
- The final installed build completed a fresh 21.3-second native window take (`recording-1791983689948.mp4`) with the controls hidden throughout startup. The native helper started without reopening the toolbar. It produced `.mic.m4a`, `.mic.wav` and valid audio metadata (44 ms microphone offset). The editor immediately recognized the isolated track. The **Start / Stop Recording** native menu command stopped it and opened the editor.
- An earlier eight-second zoom-and-sound fixture exported successfully at 960 × 540 (240 frames). The export contains the expected zoom frames and isolated chime at 2.1–2.5 seconds, with silence before/after. Export smoke reported approximately 1.16 seconds on this Mac.

## Compact UI and drawing regression follow-up

- Live editor test: searched George, previewed without changing the selected voice, clicked **Use**, observed **Applying…**, and completed real conversion of the existing synthetic 8.36-second QA microphone sample. The row became **Selected**, the mic selector displayed George, and the UI confirmed automatic playback/export selection. Fixed tuning and list-only scrolling were visually inspected.
- The editor, recorder, and Recording menu expose **Connect iPad**. The pairing panel generated a visible QR code with its five-minute expiry. Physical tablet pairing is still unverified.
- Cursor help was tested on the selected Tahoe option: the concise explanation appeared after the three-second focus delay. The fade uses 220 ms with reduced-motion support.
- Fixed drawing-surface identification to use the native window ID and owner PID, guarded the actual BrowserWindow title event, awaited renderer readiness, retried recovery once, and allowed ScreenCaptureKit publication time. Capture exclusions use window identity instead of mutable page titles. Tests cover delayed readiness, recovery and malformed IDs.
- Fixed the left-edge timer accessing a destroyed window on app shutdown. Subsequent native Quit actions exited cleanly.
- A fresh **89.09-second, 3024 × 1964** display recording completed with drawing enabled (`recording-1791986924841.mp4`, saved as `QA signed drawing capture.recordly`). Opened presenter controls, deployed the whiteboard, used the pen, and retracted the board during capture. Sampled output showed the clean whiteboard content and omitted presenter/editor controls. This is a regression check, not proof of all drawing combinations.

## Persistent signing and permission regression

- macOS logs explicitly reported the old ad-hoc code requirement mismatching the new build despite the enabled Screen Recording toggle. No reboot was needed.
- With user approval, created **MistaRecorda Local Development** in the login Keychain, restricted certificate trust to code signing, and authorized `codesign` to use that key. Temporary private-key transport files were removed. No system trust, sudoers, Full Disk Access or broad privacy resets were changed.
- `package:local:mac` requires a valid persistent identity and rejects an ad-hoc requirement. Two different production packages had different CDHashes but the identical certificate-bound designated requirement; evidence is in `.tmp/qa/signing-continuity.json`.
- Re-added only MistaRecorda’s Screen Recording and Accessibility entries for the new identity. Installed the second signed package and successfully enumerated display/window sources without refreshing those grants. Refreshed only its stale Microphone entry under the user’s earlier approval.
- The second signed build completed a fresh **34.8-second, 3024 × 1964 H.264 / 48 kHz AAC** recording with separate `.mic.wav` and `.mic.m4a` files (`recording-1791987318339.mp4`, saved as `QA signed microphone continuity.recordly`). No additional Screen Recording or Accessibility approval was needed; the checked macOS logs contained no signature mismatch. Evidence: `.tmp/qa/signing-final-capture.json`.
- Source enumeration, companion capture and native capture now preflight access. Native helpers no longer request Screen Recording repeatedly. Missing authorization stays in the app with a settings action.

## Professional interface follow-up

- Used official [OBS settings screenshots](https://obsproject.com/kb/OBS-Studio-Overview) and [DaVinci Resolve Fairlight mixer imagery](https://www.blackmagicdesign.com/products/davinciresolve/fairlight) as visual references. Applied category navigation, dense rows, neutral surfaces, restrained borders and clear control states; no third-party art or code was embedded.
- Removed promotional headings and decorative cards from capture and drawing controls. Capture settings now has fixed category navigation and a status bar; drawing has compact horizontal tabs, smaller controls and a QR panel that fits at its standard size. Editor side panels have flat borders and the section icons have visible labels.
- Native shortcut editing passed: assigned a temporary Chrome window, saved Command+Option+9, reopened and verified it, entered Command+C and saw the known macOS Copy conflict warning, then cancelled and removed the temporary assignment. Original empty window slots were restored.
- Inspected the actual React components in a local visual harness with sample data: capture at 820×592 and minimum 660×532, drawing/iPad at 440×660, voice at 380×660 and 360×512. No horizontal document overflow; the normal capture size shows all six slots. Voice tuning now uses a compact disclosure with the model shown in its header, leaving more height for voices. The harness has no credentials or real media and is layout evidence only.
- Updated UI passes TypeScript, scoped lint, production build and the Electron CommonJS smoke check. The signed package and packaged-binary smoke checks pass. After installation, live window enumeration, shortcut collision warnings, category navigation, QR generation and compact/expanded presenter controls worked. The editor loaded real ElevenLabs voices and preserved the selected changed microphone. Test window assignments were removed.

## Essential recorder, scenes and face camera follow-up

- Kept the recorder focused on source selection, audio, optional face camera, drawing and export. Capture settings now opens on Recording; optional Recording scenes saves one source and camera state without adding broadcast configuration. New-install defaults enable the microphone, preserve explicit existing audio choices, and retain automatic quality, a three-second countdown and capture glow.
- Added the editable face-camera shortcut (Command/Control+Shift+W), optional scene shortcuts, duplicate-shortcut validation and missing-source protection. The drawing content library is now labelled Drawings so it is distinct from recording scenes.
- Installed-app checks: changed the camera binding to Command+Option+9, verified persistence, restored Command+Shift+W; created a screen-only test scene, applied it, assigned Command+Option+8, and removed it. Confirmed the settings file has no remaining test scenes. Source enumeration succeeded without a new Screen Recording approval.
- Camera visibility is stored against source-media time, survives project saving, and is applied in editor preview and both frame export pipelines. Late camera activation is supported in the recorder. Native static export is bypassed when visibility cues require frame composition.
- Exported an eight-second synthetic project through the installed app's normal Export UI to `~/Downloads/MistaRecorda-camera-visibility-test.mp4` (640×360 H.264). Green camera pixels at 1s/3s/5s/7s were 19,472 / 0 / 19,472 / 0, verifying on/off/on/off intervals in the rendered file. Evidence: `.tmp/qa/camera-visibility-export.json`. This fixture validates composition; physical camera acquisition and the camera hotkey during a real take remain acceptance checks.
- Verified the installed editor's Voice settings disclosure opens and closes, loads account voices, and shows George as Selected with the changed microphone active. Saved `.tmp/qa/compact-voice-installed.png`. The normal Recording page fits at 820×592 in the visual harness, saved as `.tmp/qa/essential-recording-settings.png`.
- Final checks: TypeScript, **1,130 tests in 128 files**, production build, scoped lint (no errors), packaged-binary smoke, `git diff --check`, and strict bundle signature verification pass. The installed final build has the same persistent designated requirement; the previous app is recoverable in Trash.

## Still requiring acceptance testing

- Physical global key routing, rapid window switching, audio continuity across source changes, moved/closed sources, and conflicting shortcuts.
- Drawing board edge deployment, all tools/scenes/output modes, and exhaustive reopening of controls during display capture. Sampled clean frames do not prove every combination.
- Physical iPad QR scanning, Pencil/finger feel, reconnection and measured streaming latency.
- Every button and dialog across the whole application, smaller-window layouts, and sustained performance. No claim of zero latency or complete release acceptance is made.
- Team voice-permission sharing with another ElevenLabs workspace/member. File presets share references/settings; they do not grant voice access.

Usage: [Capture studio](capture-studio.md). Local QA media, reports and logs are under `.tmp/qa/` (ignored by Git). User projects remain under the app's recordings/Projects folder.
