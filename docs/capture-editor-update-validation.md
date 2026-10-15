# Capture and editor update — October 14, 2026

## Delivered behavior

- The compact recorder bar separates Zoom, Board, iPad, settings and source controls. Its Layers button opens the editable source list directly and toggles it closed on a second click. Zoom settings use the same charcoal styling as Capture settings.
- Layers lists displays and individual application windows with inline click-to-record shortcut boxes. A single key or modifier combination saves when every key is released; no additional Save click is required. Up to 64 source shortcuts and six saved environments are supported. Each source has a recent preview, its application icon when available, and a persistent editable label that leaves the underlying capture identity unchanged. Known app and operating-system conflicts are named in yellow; arbitrary third-party application bindings cannot be exhaustively enumerated.
- Environments save the capture source, face-camera visibility/layout, and microphone/computer-audio on/off. New environments default both audio inputs on. Existing environments without audio fields retain current audio behavior. Existing explicit recorder audio preferences remain respected.
- During native macOS window recording, environments can switch between available windows. Display changes require stopping. Inputs captured at the start can be muted/restored without changing their timing. Enabling an input absent from the take, or changing native Windows audio mid-take, returns an actionable message.
- The recording layer can be selected and resized from its edges in the editor. Shared layout geometry drives preview and export, preserves aspect ratio, persists scale, and records one undo step per drag.
- Blueprint, Contour and Graphite include original 12-second looping motion backgrounds with subtle waves/glints. The picker offers still/motion variants.
- Captions offer current-word highlighting, short phrases, single words and classic captions; generated text can be edited. First generation prepares the local speech model automatically; manual model selection lives under Advanced. The short-form order is a recommendation, not a measured performance ranking for this app.
- Custom ElevenLabs voices can be created from explicitly selected, consented audio samples. Account-owned voices can be edited where supported, with links/instructions for professional cloning and verification. Voice conversion still requires an explicit Process action after recording.
- The voice panel refreshes live models and keeps only models supporting voice conversion. Cost estimates use full original microphone duration, a five-percent buffer, and upward rounding. API USD billing is distinct from Creative credit equivalents; newer text-to-speech models are not mislabeled as voice-conversion models.

## Validation completed

- 1,213 tests across 147 files passed; TypeScript passed; production Vite/Electron build and CommonJS smoke passed. Scoped lint had zero errors and 16 existing playback hook-dependency warnings.
- Both arm64 and x64 ScreenCaptureKit helpers compiled. A synthetic PCM check ran the actual native silence function with mono 16-bit and stereo float32 buffers: all muted bytes were zero, presentation time/duration/sample count matched, and originals were unchanged.
- Backend tests exercised direct display selection, shortcut recall, saved audio on/off persistence, native mute/restore commands, and rejection of unavailable audio inputs before any camera/audio changes.
- Browser playtests used actual React components with mocked IPC: per-window shortcut capture/save; current-source defaults; both new environment audio boxes checked; saved camera placement/audio recall; reopening edits preserved those values.
- Actual editor components: drag-resizing committed once and changed scale; caption text correction propagated into preview and Canvas export renderer; current-word and single-word timing checked; moving contour background visibly changed with playback time. Custom-voice validation/verification and duration-based pricing flows passed with mocked API responses.
- Zoom key capture was tested with a named duplicate warning and a non-conflicting function key. The capture input focus race and access to a destroyed Capture settings window were fixed. Release handling covers modifier-first/last release order, native coalesced keyups, and macOS suppressed letter keyups. Multiple non-modifier keys are rejected with an explanation, since OS accelerators use one primary key plus modifiers.
- Packaged and installed using the persistent MistaRecorda Local Development identity. Deep strict codesign verification passed. The installed app launched and its Layers button opened the native live-source list directly. Native checks verified F8 auto-save, source renaming/reset, preview-based display selection, Zoom capture after closing Capture settings, and a named Window 1 conflict in Zoom. Test names and shortcuts were restored.
- The user confirmed on October 14, 2026 that holding a key combination in Layers and releasing every key saves the shortcut automatically on the physical Mac keyboard.

## Limits of this validation

Native single-key capture and save passed. Browser combination capture/release passed, and physical Mac combination-release auto-save was confirmed by the user. Global shortcut dispatch through physical input was not separately confirmed. The native automation tool represents modifier combinations as flags and cannot send modifier-only release events. The original Command–Option–1 test binding was restored through the UI by supplying a final unmodified release event. No real ElevenLabs sample upload, paid conversion, or cloud voice creation was performed. A fresh end-to-end exported video combining every new feature was not produced; shared export layout and caption renderer checks passed. Windows and physical iPad behavior were not retested in this batch. Native Capture settings screenshots are obscured by their recording-exclusion protection, so the saved visual preview uses the actual React panel in a browser test harness.


## Research references

- [ElevenLabs Voice Changer](https://elevenlabs.io/docs/overview/capabilities/voice-changer): `eleven_multilingual_sts_v2` recommendation; speech-to-speech capability is the compatibility criterion.
- [ElevenLabs API pricing](https://elevenlabs.io/pricing/api): Voice Changer $0.12/minute, API pricing in USD.
- [ElevenLabs Creative pricing](https://elevenlabs.io/pricing): 1,000 credits/minute comparison and subscription allocation, shown separately from API charges. Taxes, premium voice multipliers and account-specific billing can differ.
- [TikTok creative guidance](https://ads.tiktok.com/business/creativecenter/quicktok/online/Power_Creative_Elements/pc/en?from=001215) and [caption keyword-highlighting research](https://par.nsf.gov/biblio/10170034-evaluating-benefit-highlighting-key-words-captions-people-who-deaf-hard-hearing) informed concise readable captions. These do not establish a universal engagement order.
- [User-supplied caption reference](https://www.youtube.com/shorts/IgZmv1yz6C0) was visually inspected for the current-word highlight treatment.
