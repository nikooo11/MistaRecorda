# MistaRecorda — Implementation Plan

Personal-use fork of [Recordly](https://github.com/webadderallorg/Recordly) (AGPLv3). Keep `LICENSE.md` and Recordly attribution intact. Not distributed.

**Goal:** record screen + system (Mac) audio normally, record mic on its own track, and after recording stops, convert ONLY the mic track into a chosen ElevenLabs voice ("Voice Change"), then produce a synced final video. Originals are never overwritten.

---

## Phase 0 — Recon (no code changes)
Read and document in `docs/architecture-notes.md`:
- `electron/main.ts`, `electron/preload.ts`, `electron/ipc/register/*.ts`
- `electron/ipc/recording/{library,diagnostics,windowsFallbacks}.ts`
- `src/hooks/useScreenRecorder.ts`, `src/hooks/useMicrophoneDevices.ts`
- `src/components/launch/RecordingControls.tsx`, `src/components/launch/popovers/MicPopover.tsx`
- `electron/ipc/captions/{generate,audioCandidates,mergeSources}.ts` (already extracts mic audio — reuse)
- i18n system, settings storage, export pipeline, ffmpeg-static usage

Answer: Is mic stored separately or mixed with system audio? Where are recording files written? How does export pick audio sources?

**Done when:** notes file committed; `npm install && npm run typecheck && npm test` pass on untouched code.

## Phase 1 — Branding (local only)
- `package.json`: `productName` → `MistaRecorda`, `name` → `mistarecorda`, appId → `com.nikooo11.mistarecorda`.
- Window titles / About screen: "MistaRecorda — based on Recordly". Do not reuse Recordly logo assets as our brand; keep attribution visible in About + README.
- README: short header explaining the fork + credit.

## Phase 2 — Separate mic track
- Guarantee every recording saves mic as its own file: `<id>.mic.wav` (48 kHz, mono, PCM s16le), alongside existing video/system audio.
- If mic is currently mixed, capture it separately in addition (don't break existing output).
- Store metadata in the recording's library entry: `{ micPath, systemAudioPath, micOffsetMs }`.
- Measure and store mic start offset relative to video so sync can be restored.

**Tests:** library metadata read/write; file naming.

## Phase 3 — Settings & secrets
New settings section "Voice Change":
| Setting | Type | Default |
|---|---|---|
| enabled (auto-run after recording) | bool | false |
| apiKey | secret (Electron `safeStorage`) | — |
| voiceId / voiceName | string | — |
| modelId | `eleven_multilingual_sts_v2` \| `eleven_english_sts_v2` | multilingual |
| removeBackgroundNoise | bool | true |
| stability | 0–1 | 0.5 |
| similarityBoost | 0–1 | 0.75 |
| style | 0–1 | 0 |
| outputFormat | `pcm_44100` \| `mp3_44100_192` | pcm_44100 (fallback mp3) |

Rules: key encrypted at rest, never logged, never returned to renderer (renderer only sees `hasKey: true`). "Test key" button calls `GET /v1/user`.
Voice picker: `GET https://api.elevenlabs.io/v1/voices` (header `xi-api-key`), show name + preview audio.
One-time notice: "Only your mic audio is uploaded to ElevenLabs."

## Phase 4 — Conversion engine (`electron/ipc/voice/`)
Files:
- `elevenlabs.ts` — API client (voices, user, speechToSpeech)
- `chunker.ts` — split/rejoin with ffmpeg
- `job.ts` — job queue, progress, cancel
- `register.ts` — IPC channels (`voice:listVoices`, `voice:start`, `voice:cancel`, `voice:progress` event, `voice:testKey`)

Pipeline:
1. Input `<id>.mic.wav`.
2. `ffmpeg silencedetect` → choose cut points ≤ 4:00 per chunk, preferring silence within ±10 s of boundary; else hard cut.
3. For each chunk: `POST https://api.elevenlabs.io/v1/speech-to-speech/{voiceId}?output_format=...` multipart: `audio`, `model_id`, `remove_background_noise`, `voice_settings` = `{stability, similarity_boost, style, use_speaker_boost: true}`.
4. Concurrency 2. Retry 429/5xx with exponential backoff (1s,2s,4s,8s; max 4). Map 401/402/422 to readable UI errors (bad key / out of credits / bad audio).
5. Decode outputs → 48 kHz mono; rejoin in order with 50 ms crossfade on hard cuts (`acrossfade`), plain concat at silence cuts.
6. Duration fix: pad/trim with silence so output length == input length (±50 ms).
7. `loudnorm` on converted mic only, target −16 LUFS, TP −1.5.
8. Write `<id>.voice-mic.wav`. Temp dir: `app.getPath('temp')/mistarecorda-voice/<jobId>/`, cleaned up on finish/cancel/error.

## Phase 5 — Mix & export
- Quick output: `<id>.voice.mp4` = original video (`-c:v copy`) + system audio unchanged + `<id>.voice-mic.wav` mixed via `amix=inputs=2:normalize=0`, honoring `micOffsetMs` with `adelay`.
- Editor: per-recording switch "Mic audio: Original / Changed voice"; Recordly's normal export (zoom, cursor effects, captions) uses the selected mic file.
- Captions: regenerate from original mic (better transcription) but apply to changed-voice export.

## Phase 6 — UI
- Auto-run after stop when enabled; "Change voice" / "Re-run" button in library.
- Progress: "Converting voice: chunk 3/7", percent bar, Cancel (aborts fetch via AbortController, deletes temp).
- Done toast: Open, Show in Finder. Error toast with Retry.
- Badge on library items with a changed voice.
- All strings via i18n (`npm run i18n:check`).

## Phase 7 — Tests & quality
Vitest:
- chunk planner (cut points, max length, silence preference)
- duration math (pad/trim within 50 ms)
- request builder (multipart fields, headers; mocked fetch)
- retry/backoff and error mapping
- settings persistence; key never exposed to renderer
- ffmpeg arg builders for mix/export
Commands that must pass: `npm run typecheck`, `npm run lint`, `npm test`.

## Phase 8 — macOS check (manual, on Mac)
- Mic permission prompt (`NSMicrophoneUsageDescription`), screen + system audio capture still work.
- `npm run dev` end-to-end: record 30 s talking over a YouTube video → YouTube audio unchanged, voice converted, in sync at start/middle/end.
- `npm run build:mac` produces a working personal app.

## Phase 9 — Docs
`docs/voice-change.md`: setup (API key, plan with voice changer access, choosing a voice), pipeline diagram, settings reference, troubleshooting (401/402/429, drift, permissions), privacy note.

## Out of scope (for now)
Real-time/live voice changing, Windows/Linux voice features, distribution/signing.

## Rules
- Never overwrite original recordings.
- Only upload mic audio; never video or system audio.
- Only use voices you own or have permission to use.
- Small commits per phase on branch `feature/voice-change`; open a PR to `main` at the end with a summary of files changed.
