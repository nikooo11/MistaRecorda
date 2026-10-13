# MistaRecorda architecture reconnaissance

Baseline: `32da961`, the personal fork's implementation plan. Existing license and upstream attribution are retained.

## Capture and storage

`useScreenRecorder.ts` coordinates native macOS ScreenCaptureKit, Windows WGC and browser capture, recording clocks, pause intervals, webcam sessions and microphone fallbacks. Native macOS capture is in `electron/native/ScreenCaptureKitRecorder.swift`: video, system `.system.m4a`, and microphone `.mic.m4a` are separate writers. The inline video audio is system audio when enabled, otherwise microphone audio; it is not a reliable mic-only source. Audio presentation times already use the video clock and account for pauses. Browser mic fallback saves `.mic.wav` at 48 kHz mono PCM, and `.mic.wav.json` records the measured start delay. Native macOS microphone samples can begin after the first frame; preserve that offset when decoding AAC to WAV.

`register/recording.ts` owns recording IPC. `recording/mac.ts` finalizes video and preserves companion audio; its function named `muxNativeMacRecordingWithAudio` currently moves sidecars rather than mixing. `recording/diagnostics.ts` probes and selects companion audio, including an embedded-audio preference that can hide a separate mic. Voice export must explicitly choose known system/mic sources to avoid doubling or converting embedded audio.

Recordings default to `userData/recordings` (`electron/appPaths.ts`), with a configurable recordings directory. `project/session.ts` persists webcam links in `.recordly-session.json`; its current manifest is removed when no webcam exists. Project library entries come from `register/project.ts`, not a recording library module. Add independent per-recording audio metadata rather than placing voice metadata in this webcam-only manifest.

## Captions and export

The plan's `captions/audioCandidates.ts` and `mergeSources.ts` do not exist. `captions/generate.ts` contains `resolveCaptionAudioCandidates`, `extractCaptionAudioSource` and silence detection. It currently tries the recording's first audio stream, then linked webcam audio. Reuse that extraction pipeline but prefer the original isolated mic, aligned to the video clock; never transcribe converted mic by accident.

Renderer preview/export obtains `get-video-audio-fallback-paths`. `src/lib/exporter/audioEncoder.ts`, `audioRoutingEngine.ts` and `sourceAudioFallback.ts` decode/mix tracks, apply track gain/mute settings, and account for sidecar delays. Preserve this normal editor route and substitute only the selected mic companion. Video edits, overlays and captions remain in Recordly's exporter.

## Settings, IPC, localization and secrets

`registerSettingsHandlers` stores general settings in `app-settings.json` and recording preferences separately. Existing arbitrary app-settings IPC is not suitable for credentials. Voice secrets require a dedicated main-process store encrypted with Electron safeStorage; Linux's basic_text backend must be rejected. Environment keys may be used in main only. Renderer receives hasKey, never the saved key.

`ipc/handlers.ts` registers features, `preload.ts` exposes narrow methods through contextBridge, and `electron-env.d.ts` describes renderer types. Voice IPC follows this pattern, validates all inputs and exposes structured error codes rather than raw API errors or request headers.

Localization uses `I18nContext`, `useScopedT` and JSON namespaces under `src/i18n/locales`. Voice UI strings must be resource-backed. The upstream locale parity check is advisory in CI because existing translations are incomplete.

## Baseline and plan corrections

The repository has no `typecheck` npm script; the CI equivalent is `tsc --noEmit`. Phase 1 will add that alias. Use `npm ci` for the locked baseline: `npm install --package-lock=false` ignores the lock and selected incompatible newer packages; it also attempted a source rebuild in a read-only home. Restoring with `npm ci` avoids changing dependencies. The cloud environment requires its `/workspace/.cloud-setup/activate.sh` for native build tools and proxy setup.

Mac capture, native helper rebuilding and release packaging require a real Mac and are deliberately deferred to the manual checklist. ElevenLabs conversions are mocked per the user's later instruction; only a read-only account/key readiness request is authorized for live validation.
