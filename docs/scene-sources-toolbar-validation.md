# Scene sources, settings and desktop toolbar validation

October 15, 2026 — macOS arm64 local signed build.

## Behavior

- Scenes support managed image/GIF, video and audio imports. Sources have visibility, order, position, size, opacity, volume and looping controls. Files are copied into app storage, so moving the original import does not break a scene.
- New scenes enable facecam, microphone and computer audio, with a soft camera border/shadow. Camera frame choices persist into the editor and both export compositors.
- Settings, iPad and Zoom are independent companion windows. Opening one leaves the recording studio available; repeating its button hides it.
- Setup contains both OpenAI and ElevenLabs credentials. Saved local keys can be replaced or removed; the voice store honors explicit local removal even when a developer environment key exists. Key presence does not decrypt saved credentials.
- Favorite and Love explain their different scopes. Sound favorites reset after a take; Love persists and is synchronized to the iPad.
- Recording options expose explanations after three seconds of hover or keyboard focus. Drawing is labeled **Include drawings in recording** and defaults on. Private controls/shadow notes are still excluded.
- The Mac drawing toolbar uses the display work area instead of screen origin. Its dotted grip allows dragging or arrow-key movement, clamps to the usable screen, and resets top-center on editor reopen or whiteboard/screen mode changes. The canvas origin is unchanged, preserving pointer alignment.

## Completed checks

- Full automated suite: **168 files / 1,321 tests passed**. Typecheck, production Vite build, Electron CJS smoke check, local signing and strict deep signature verification passed. The app was installed in `/Applications/MistaRecorda.app`; the local installer is `release/MistaRecorda-local-arm64.pkg`.
- Browser playtests exercised real components with isolated fixture transport: image/video/audio import and source settings, reorder/hide/save, new-scene defaults, key save/replace/remove status, Favorite/Love, and delayed help. No real API keys were entered or charged.
- Desktop toolbar fixture: initial position `(349,48)` below a simulated 38px menu bar; dragged to `(43,398)`, clamped against the top-left edge at `(4,42)`, then reset to `(349,48)` after closing/reopening. No ink was added by dragging the grip.
- Installed native app: Settings opened as a separate window and closing it returned to the still-open studio. Setup showed saved-key status without a Keychain prompt. Drawing inclusion was on; Draw on screen and Open whiteboard exposed the movable toolbar. Native protected windows cannot be visually captured by the automation tool, so toolbar edge measurements were verified in the browser fixture.
- A generated five-second video imported through the native file picker, survived scene save/recall and appeared in a 20.7-second recording. An inspected frame at two seconds showed the video over the desktop with recorder controls excluded.
- That recording exposed a native finalization ordering bug: persistence preceded the stopped-state event, leaving the last scene audio interval open. Persistence now closes the interval idempotently. The regression test creates real audio/video, saves before the stopped event, verifies the mixed audio file, then confirms a repeated stop/save does not mix twice.
- Reinstalled final build: recorded a 58.2-second native take. The first five seconds contained the test tone (mean −24.1 dB, peak −16.7 dB); seconds 10–15 were silent (−91 dB). A frame at ten seconds held the clip’s final 4.958-second frame. Recorder controls were excluded. The temporary scene was removed and microphone/computer audio restored to On.
- Non-looping video browser check: at five seconds the video remained at its final frame with `paused=true` and `ended=true`.

## Scope limits

Physical iPad/Pencil, multiple monitors and Windows/Linux were not retested in this pass. Camera-frame export routes are covered by shared geometry checks and typechecking; a new full camera export was not run. The studio center remains an explicitly labeled source snapshot, not a live composite preview. The package uses the existing local certificate; public distribution still needs the release signing/notarization process. Claude's separate AI-chart worktree was not modified.
