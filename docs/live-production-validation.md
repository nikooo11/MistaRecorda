# Live production validation — October 15, 2026

## Automated and build checks

- TypeScript passes; the complete Vitest suite passes **1,231 tests in 153 files**.
- Tests cover exact-window focus invocation and failure handling, recording-source acknowledgement, sound-trigger rollback, favorite/color persistence, stream routing/device constraints, timeout and disconnect cleanup, meme validation and independent surface persistence, and narration-boundary validation.
- Real FFmpeg integration tests verify single inclusion of timed sounds, isolated microphone preservation, failed-mix rollback, and multi-voice span ordering/duration/microphone offset. ElevenLabs requests in these new multi-voice tests are mocked; these tests do not establish live service acceptance.
- Production Vite build and Electron CommonJS smoke pass. ScreenCaptureKit recorder and window-list helpers compile for Apple Silicon and Intel. The Apple Silicon package uses the persistent local signing certificate and passes deep/strict signature verification. No privacy grants were reset.

## Installed Mac playtests

- Imported a WAV, renamed it **QA Chime**, favorited it and played it. The Stream tab enumerates audio devices and refuses to start without routing selections.
- Imported an animated GIF. This revealed that Electron's still-image decoder rejected valid GIF input; the dedicated GIF validator fixes that import path. The library displays a preview and per-item gear settings. Saved a Fade entrance and attached QA Chime, placed the meme, put the whiteboard away and reopened it, then cleared the board. The deployed meme persists across switching and disappears on clear.
- Opening the recording voice picker no longer accesses Keychain. Original voice is selected, Refresh is disabled during a take, and an empty catalog tells the user to load voices before the next recording.
- A newly created whiteboard initially recorded as a blurred rectangle during a single-window take. The recorder now waits for the clean canvas to paint and for non-provisional native window dimensions. The successful regression take is **QA verified window whiteboard meme.recordly**, with source `recording-1792076645277.mp4` (98.454 seconds, 2984 × 1708, H.264/AAC). Sampled frames show Window A, then the clear whiteboard, then the animated GIF. Successive GIF frames visibly differ. Presenter controls and placement tools are absent from the video.
- That take's isolated system track contains one 350 ms sound at **78.304–78.654 seconds**, with silence elsewhere. Its sound manifest has no duplicate editable clip and identifies the sound as included in the recording. The original `.mic.wav` and microphone offset metadata remain available. An earlier take also confirmed single inclusion at 65.167–65.517 seconds.
- Independent native capture checks exercised an already-open board and the screen-to-board transition; both rendered the clean surface correctly. The important fresh-window regression above was tested through the installed app's recording controls.

## Outstanding acceptance checks

- Live ElevenLabs enumeration/conversion encountered a macOS Keychain authentication prompt. The user was away from the Mac; no password was requested in chat and no new paid conversion was performed. Cached recording choices work without unlocking the key, but a real multi-voice conversion still needs the user's authentication and an accessible voice catalog.
- End-to-end Stream mode into OBS/Zoom/Discord requires a virtual audio driver. Driver installation was not approved, so no driver was installed and no actual receiving-app loopback was claimed as tested. Browser audio routing/cleanup has automated coverage and device enumeration passed.
- The Mac locked during the final combined hotkey-focus/editable-sound/voice-cue UI pass. Exact-window focus and editable sound manifests have automated coverage, but that final physical UI pass is unfinished. The clear whiteboard/GIF capture and default included-audio checks above completed before the lock.
- No physical iPad, Windows or Intel Mac acceptance pass was available for these additions. The companion uses the shared board/sound/voice request paths. Independent drawing/meme persistence has regression coverage.

The successful test project is retained for inspection. Temporary QA shortcuts, sound-library entries and board memes are restored/removed after testing, with recovery copies kept under the ignored `.tmp/qa` directory. The app is left closed after installing the final signed build.
