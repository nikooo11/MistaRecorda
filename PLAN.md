# MistaRecorda — Implementation Plan

## Presentation workflow roadmap (October 17, 2026)

| Item | Status |
|---|---|
| 1. Talking points with attached references | Built — device/capture playtest pending |
| 2. Always-visible iPad record controls | Planned |
| 3. Phone/iPad remote and Stream Deck endpoint | Planned |
| 4. YouTube upload | Planned — waiting for YouTube approval |
| 5. Native vertical 9:16 capture and Send to phone | Planned |
| 6. USB fallback investigation and Apple Pencil | Planned |
| 7. Native iPad app plan | Planned |



Personal-use fork of [Recordly](https://github.com/webadderallorg/Recordly) (AGPLv3). Keep `LICENSE.md` and Recordly attribution intact. Not distributed.

**Goal:** record screen + system audio on macOS and Windows normally, record mic on its own track, and after recording stops and the user clicks Process voice, convert ONLY the mic track into a chosen ElevenLabs voice ("Voice Change"), then produce a synced final video. Originals are never overwritten.

---

## Phase 0 — Recon (no code changes)
Read and document in `docs/architecture-notes.md`:
- `electron/main.ts`, `electron/preload.ts`, `electron/ipc/register/*.ts`
- `electron/ipc/recording/{mac,diagnostics,windowsFallbacks}.ts` and `electron/ipc/register/project.ts` (there is no recording/library.ts)
- `src/hooks/useScreenRecorder.ts`, `src/hooks/useMicrophoneDevices.ts`
- `src/components/launch/RecordingControls.tsx`, `src/components/launch/popovers/MicPopover.tsx`
- `electron/ipc/captions/generate.ts` (candidate selection and extraction live together; extend it to prefer isolated original mic)
- i18n system, settings storage, export pipeline, ffmpeg-static usage

Answer: Is mic stored separately or mixed with system audio? Where are recording files written? How does export pick audio sources?

**Done when:** notes file committed; locked `npm ci`, CI-equivalent `npx tsc --noEmit`, and `npm test` pass on untouched code. The baseline has no typecheck script; add it in Phase 1. See architecture notes for the failed unlocked install diagnosis.

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
- Processing is manual: after stop, show "Process voice" / "Process voice again" in the editor and library. Never upload on recording completion; discard the old auto-run setting.
- Exactly one favorited voice is selected immediately and on every startup, without an API call; zero/multiple favorites retain the last selection. Show the selected voice before processing.
- Progress: "Converting voice: chunk 3/7", percent bar, Cancel (aborts fetch via AbortController, deletes temp).
- Done toast: Open, Show in folder. Error toast with Retry.
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

---

# Phase 10 — Voice Favorites, Presets, Team Sharing, Import/Export

## What's possible (verified against ElevenLabs API docs)
| Want | Possible? | How |
|---|---|---|
| Browse ElevenLabs voices | ✅ | `GET /v1/voices` (my voices), `GET /v1/shared-voices` (public Voice Library, with search/filters) |
| Favorite voices, saved | ✅ | Local favorites in MistaRecorda + optionally add library voice to account: `POST /v1/voices/add/{public_user_id}/{voice_id}` (`bookmarked: true`) |
| Use my trained/cloned voices | ✅ | They appear in `GET /v1/voices` (category `cloned`/`professional`/`generated`) |
| Edit trained voices | ✅ (owned voices only) | `POST /v1/voices/{voice_id}/edit` (name, description, labels, add samples) + `POST /v1/voices/{voice_id}/settings/edit` (default stability/similarity/style/speaker boost) |
| Team uses same voice | ✅ with multi-seat workspace | `POST /v1/workspace/resources/{voice_id}/share` `{resource_type:"voice", role:"viewer"|"editor"|"admin", user_email|group_id}` |
| Export a voice as a file another user loads | ✅ as a **preset file** | The file stores voice reference + settings + preview, NOT the voice model itself (ElevenLabs doesn't allow exporting voice models). Importer must have access to the voice (same workspace share, or public library voice auto-added, or re-clone from included samples if they own consent). |

**Key limitation:** a voice "lives" in an ElevenLabs account. A preset file works on another person's machine only if their API key can access that `voice_id`. MistaRecorda resolves this automatically on import (see Import flow).

## Data model
`VoicePreset` (JSON, schema-versioned):
```json
{
  "schema": "mistarecorda.voice-preset",
  "version": 1,
  "id": "uuid",
  "name": "Narrator Deep - calm",
  "createdBy": "user email or name",
  "createdAt": "ISO",
  "updatedAt": "ISO",
  "voice": {
    "voiceId": "21m00T...",
    "source": "library | owned | workspace-shared",
    "publicOwnerId": "for library voices, else null",
    "originalName": "Adam",
    "category": "premade | cloned | professional | generated"
  },
  "settings": {
    "modelId": "eleven_multilingual_sts_v2",
    "stability": 0.5,
    "similarityBoost": 0.75,
    "style": 0,
    "useSpeakerBoost": true,
    "removeBackgroundNoise": true,
    "postFx": { "loudnessLufs": -16, "eqPreset": "none", "pitchSemitones": 0 }
  },
  "preview": { "format": "mp3", "base64": "...", "text": "sample line" },
  "tags": ["team", "youtube"],
  "isFavorite": true
}
```
- Edited = any preset whose settings differ from the voice's defaults; presets are always editable and re-saveable ("Save" / "Save as new").
- `postFx` is applied locally with ffmpeg after conversion, so edits work even on voices the user can't edit in ElevenLabs.

## Storage
- Local: `app.getPath('userData')/presets/*.mpvoice.json` + `favorites.json` (list of voiceIds).
- Team: shared preset folder setting ("Team presets folder"), e.g. a Google Drive / Dropbox / iCloud / network folder synced to all teammates. MistaRecorda watches it (chokidar) and shows "Team" presets alongside "Mine". Conflict rule: `updatedAt` wins, keep `.bak` of overwritten file.
- Optional later: store team presets in the GitHub repo or a small backend; out of scope for v1.

## Export / Import
- **Export:** any preset (edited or not) → single file `<name>.mpvoice` (JSON above, preview embedded). Also "Export all" → `.mpvoice-pack` (zip of presets).
- **Import (drag-drop or File > Import):**
  1. Validate schema/version (reject unknown future versions with a clear message).
  2. Check access: `GET /v1/voices/{voiceId}` with the importer's key.
  3. If no access and `source = library` → auto-add via `POST /v1/voices/add/{publicOwnerId}/{voiceId}` then retry.
  4. If no access and voice is workspace-owned → show "Ask <createdBy> to share this voice" + button that copies their email/voiceId; owner's MistaRecorda has "Share with team" which calls the workspace share endpoint.
  5. On success, save preset locally (prompt rename on name clash), mark favorite if it was.
- Imported preset loads selected voice + all settings exactly; the preview plays immediately even before access is resolved.

## UI
- **Voice Browser** tab: My Voices / Library (search, gender/accent/use-case filters) / Favorites / Presets (Mine, Team). Each row: play preview, ★ favorite, "Use", "Make preset".
- **Preset Editor:** sliders for stability, similarity, style, speaker boost, noise removal, model, post-FX; "Generate preview" (runs a short built-in sample through STS); Save / Save as new / Export / Share with team / Delete.
- **Trained voice editor** (owned voices only): rename, description, labels, add samples, set default settings → calls ElevenLabs edit endpoints; disabled with tooltip for voices you don't own.
- Recording toolbar: quick preset dropdown (favorites first).

## Team setup (requires an ElevenLabs plan with multiple seats / workspace)
1. Admin creates voices or adds library voices, then "Share with team" (role viewer, or editor for people allowed to edit the voice).
2. Admin sets Team presets folder; teammates point MistaRecorda to the same synced folder.
3. Each teammate uses their own API key (stored with safeStorage); never put keys in preset files.

## Security
- Preset files never contain API keys or account secrets.
- Only include voice samples in an export if the user explicitly checks "Include samples" and confirms they have consent to clone that voice.

## Tests
- Schema validation + migration (v1)
- Import access-resolution flow (mocked API: owned / library / workspace no-access)
- Export → import roundtrip produces identical settings
- Team folder watcher conflict handling
- Edit endpoints only offered for owned voices
