# Live recording studio — October 16, 2026

## Behavior

- OBS-inspired compact scene bank, Sources dock, large live composition preview and recording controls. Existing Board, iPad, Memes, Sounds, Zoom and Settings controls remain accessible.
- First setup creates a Screen explainer scene once: main screen, facecam with soft frame, microphone and computer audio on. Existing scenes, media, drawings and keys are preserved. No background recording starts.
- Native macOS preview uses a silent 15 fps ScreenCaptureKit helper, bounded latest-frame delivery and an idle lease. Facecam reuses the existing camera stream with actual layout/frame/mirroring; no second camera device is opened.
- Image/GIF/video/audio scene inputs, visibility and ordering. Select a visual input to position/resize it in the preview; Properties supports precise dimensions and opacity. Audio/video sources retain volume and loop settings.
- Scene shortcuts replace the visible window-shortcut setup. Legacy slots migrate once. Native recording switches between windows and displays, preserving the original take size and clock.
- Presenter URL objects open a new Chrome tab and temporarily select that browser window. Return to scene restores the prior source without closing the tab; tab closure also restores it. Manual scene/source changes cancel the override.
- Show window in recording defaults off; it controls the main studio’s inclusion in this app’s display recording/preview/still pipeline. Utility panels remain excluded. macOS external capture apps can ignore OS screenshot protection.
- Reset recommended defaults includes hiding the studio, both audio inputs on, three-second countdown, soundboard inclusion, capture glow, and automatic click zoom off. It does not delete user content.

## Validation

- All 1,387 tests in 181 files passed after integrating the concurrent editor-clip and touch-selection changes. TypeScript, Electron CJS entry smoke and persistent-identity signed packaging passed; the signed app was installed and deep signature verification passed.
- Launch initialization is consolidated so the ready-to-record scene applies once after recorder listeners attach. Existing saved drawings are retained; startup does not clear them.
- Automated coverage includes split/oversized preview frames, stale source and camera frames, idle cleanup, preview restart, legacy shortcut migration, non-destructive starter scene creation, scene-media IPC trust and source validation, URL override restoration/cancellation/failure, and preview movement/size bounds.
- Native app playtest confirmed continuously changing clock/animation in the selected Chrome window, facecam frame placement, image import and inclusion in the preview, quick Memes access, and whiteboard open/close.
- A 264.6-second test recording switched Chrome → display → Chrome. Inspected native output frames before/during/after switching: image overlay returns with the window scene; studio controls are absent from the display recording. Output is a playable H.264/AAC file and opened in the editor. Saved as QA Live studio source switching.
- Installed app confirmed a 30% → 20% width edit persisted, and Reset to default settings restored the studio-visibility flag to off. The temporary test scene was removed; the original scenes remain.
- Numeric size entry found during playtest was fixed to commit on blur, allowing intermediate digits. Pointer commit uses release coordinates so a fast drag does not depend on React having rendered a move event.

## Limits of this pass

- This validates native macOS arm64 recording. The x64 native helpers compile; Windows/Linux capture behavior was not playtested.
- Native automation could not reliably send preview drag motion or global hotkey gestures. Precise property editing was verified; geometry/release behavior has regression coverage. Existing shortcut regression coverage is retained; physical key behavior is not newly certified here.
- Chrome automation permission and physical iPad/Pencil behavior need a user-side check. URL session semantics are covered by automated tests; no new OS permission was granted unattended.
- Sources currently support one base display/window, one facecam and up to 24 image/video/audio overlays per scene, not arbitrary simultaneous capture cards or multiple cameras. Live level meters are not added in this pass.

## OBS visual pass — 2026-10-16

The recording home now uses stacked Scenes/Sources docks on the left, a large live
composition preview, and Audio & camera, Presenter tools, and Controls along the
bottom. The palette, narrow gaps, dock headers, selected rows, and small-radius
button states were compared with OBS 32.2.2 and the Yami theme in
https://github.com/nikooo11/obs-studio/blob/master/frontend/data/themes/Yami.obt.
This is an adaptation of the existing React studio; existing recorder, iPad,
whiteboard, scene/media, soundboard and editing pipelines remain in place.

Direct AI mic and Voices buttons open the existing figure assistant and
ElevenLabs recording voice picker. Opening AI mic does not begin listening or
send content. The microphone meter uses live input from the selected device;
it is an input-activity display, not a calibrated dB meter or gain control.

Validation: typecheck, production build, Electron CommonJS smoke check, and
1,387 tests in 181 files passed. Browser playtest covered the 820×600 minimum
and 1140×760 default sizes, scene switching, countdown, pause, and all presenter
buttons remaining inside the window. A direct OBS-window reference recording
was inspected after capture; Studio Mode was restored to off.

First-launch defaults checked: a Screen explainer scene, microphone and computer
audio on, soft-framed facecam, three-second countdown, soundboard included in
recording, studio hidden from capture, and automatic click zoom off. Existing
saved preferences and scenes are preserved; Reset to defaults remains available.

The signed installed build was checked on macOS: AI mic opens the assistant on
the first click after launch, Voices opens the populated ElevenLabs voice list,
and Settings opens separately with the recording studio retained. A pending
panel request is consumed only by the presenter window after React mounts;
hidden drawing surfaces cannot steal it. AI research itself was not run because
this installation reports that its OpenAI key has not been configured.
The live microphone meter responded to input. Studio capture was temporarily
enabled for the UI screenshot, then restored to off; facecam was restored to on.

## Meme playback defaults — 2026-10-16

New uploads and bundled memes now appear immediately, remain for three seconds,
then spin out over the existing 450 ms transition. Clicking a visible placement
starts its exit early. Repeated clicks cannot restart an exit, and clicking
during an automatic exit cannot extend it. Shadow notes retain their private
behavior until revealed.

Existing library assets using the complete old default playback settings are
upgraded once; custom playback settings, sounds, and existing placements are
preserved. The installed library confirmed three seconds, Spin out, and Stay
until clicked off. Browser playtest observed automatic spin-out at 3007 ms and
click-triggered spin-out at 266 ms. Typecheck and 26 focused meme, bundle and
board-store tests passed. The studio visibility checkbox remains off by default.

## Desktop meme dismissal — 2026-10-16

The clean Mac drawing surface ignored all mouse events, and its meme buttons were
disabled outside drawing mode. It now accepts the first click only while the
pointer is inside a visible, live meme, using the scene zoom/scroll and actual
window origin. All other desktop space remains click-through; removed, expired,
hidden and shadow memes do not capture input. The clean renderer and iPad Pan &
zoom view allow meme dismissal without enabling drawing or showing editor tools.
Dismissal resolves the placement across scene changes and saved whiteboards, and
repeated clicks do not restart its exit.

Validation: typecheck, 30 focused meme/default/bundle/store tests, production
build, Electron CommonJS smoke check, and strict signed-app verification passed.
The idle app was updated in /Applications. The user confirmed that clicking the
existing stuck desktop meme directly, without opening drawing tools, removes it.
This physical check covers the native transparent-window input path that browser
playtesting had missed. Facecam was restored to on and studio capture remains off.
