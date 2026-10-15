# Recording Studio implementation and validation

Validated October 15, 2026 on macOS arm64.

## Shipped behavior

- The floating dock is replaced by a normal resizable, minimizable charcoal studio window. Its bounds persist, are clamped to available displays, and do not create an invisible desktop input region.
- The existing recorder hook stays mounted while minimized or hidden. The native Mac capture path keeps the studio visible and excludes the app through the existing ScreenCaptureKit filter. Alternate capture paths still hide controls before capture.
- Scenes and Sources reuse the saved environment, source preview, naming, hotkey, foreground switching and glow mechanisms. The center is explicitly labelled **Source snapshot · refresh to update**; it is not a live or final composition preview.
- Large record/stop, pause/resume, elapsed timer, countdown, facecam, microphone and computer-audio controls are available. Camera device/layout details collapse. Countdown cancellation now resolves the pending start so a second attempt works.
- Existing icons are reused. Zoom, iPad, Sounds, Settings and Drawing tools toggle their utility windows. Board toggles the whiteboard. Projects opens a recent-project section.
- Facecam uses the independent desktop overlay, with screen-coordinate dragging, an existing position lock, and a native menu containing Hide facecam and layout settings. Hiding routes through the recorder so the recorded visibility cue changes too.
- Automatic click-to-zoom remains off by default. Both audio inputs default on; scene-specific settings are retained.

## Checks completed

- TypeScript typecheck and Electron main entry smoke check passed.
- Full automated suite: 167 files / 1,310 tests passed. Two additional facecam drag tests subsequently passed with the related 22-test regression run. They cover continuous screen-coordinate movement, negative display origins, releasing a gesture, and locking mid-gesture.
- Countdown tests cover cancel, restart, duplicate start and invalid inputs. Geometry tests cover detached displays and invalid persisted bounds. Capture preparation test confirms native Mac keeps only the recorder controls visible while other utility panels hide.
- Browser playtest of the real studio component with local fake sources: countdown cancel/restart, record/pause/resume/stop states, scene/source switching, controls at 820×600, and default-size layout. Fixture media and state are test data.
- Signed native app: selected the primary screen, completed the three-second countdown, recorded with the studio visible, paused at 00:20, resumed, minimized, restored through Recording → Show Recorder Controls, and stopped into the editor. A playable 52.6-second capture was created and the validation project saved.
- Inspected native captured frames at 5 and 40 seconds: underlying desktop remained visible and studio controls were absent. This verifies the new visible-controller path for display recording; it is not a claim that every platform/export combination was retested.
- Settings opened from its button; after returning to the studio, clicking Settings again hid it. Native facecam On/Off state and camera sidecar creation were observed. Microphone and computer audio were restored to On after the silent test.
- Final app and local installer built successfully with the existing local signing identity. Strict deep code-sign verification passed.

## Remaining manual coverage

The protected camera window is not exposed visually to the current native automation tool, so direct physical drag/right-click and hotkey release were not certified by this playtest. The new drag regression tests pass. iPad hardware, cross-display facecam movement, single-window whiteboard export, and Windows/Linux capture were not re-tested in this pass. Their existing pipelines were retained.

A continuous composite preview and audio level meters from the original design are follow-up work; the current UI deliberately identifies its source snapshot. No Claude AI-chart files or worktrees were changed.
