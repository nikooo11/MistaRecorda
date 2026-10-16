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
