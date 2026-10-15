# Recording Studio window

Planning proposal — October 15, 2026. This document does not change the installed recorder.

## Intended experience

Replace the floating recorder bar as the default interface with a normal, resizable Recording Studio window. Use MistaRecorda's existing charcoal settings theme and integrated Mac traffic lights. Keep the window visible during recording unless the user minimizes or hides it. Its controls, menus, preview and capture glow must stay out of MistaRecorda recordings.

Use OBS's scenes → sources → preview → recording controls organization, simplified to the existing MistaRecorda features. A scene is the user's saved environment; use “Scenes” consistently rather than presenting two competing names. Existing scenes, hotkeys and settings migrate unchanged.

## Layout

- Default size about 1080×720; usable down to 820×620. Persist bounds and clamp to connected displays when reopening. No invisible full-screen hit region and no always-on-top control window by default.
- Left, about 200px: saved scenes with active indicator and editable shortcut beside each. Below, sources for the selected scene: recorded screen/window, facecam, whiteboard/drawings. Show app icons, small source previews, source name, visibility where supported, and gear/settings actions.
- Center: large, aspect-correct preview with the selected source name and Ready / Recording / Paused status. Clearly distinguish a source preview from a final composition preview until the latter is actually implemented. Never label a periodically refreshed thumbnail “live.”
- Right, about 240px: prominent Start recording / Stop & edit button, Pause / Resume, elapsed recording time, and countdown selector (Off, 3, 5, 10 seconds; default 3). Show actual configured shortcuts next to actions.
- Below the preview: microphone and computer-audio toggles, device names, and real level meters when available. Both inputs default on; saved scene settings remain authoritative. Facecam toggle and shortcut are always visible.
- One compact tools row: Zoom Z, Whiteboard, Connect iPad / connection status, Soundboard, Memes, Notes, Settings. Open utility panels inside the studio or as bounded movable windows. Retain existing iPad tools and private presenter content.
- Collapsible scenes/sources and responsive stacking prevent overlapping controls. The recording controls remain available at the minimum window size.

## Recording workflow

1. Pick a scene or source. Display its identity and audio/camera state immediately; report a source switch as active only after the capture backend acknowledges it.
2. Start recording by button or configured shortcut. Check source and permissions before countdown. Show 3 → 2 → 1 and a visible Cancel countdown action. The countdown is excluded from the take.
3. While recording, show elapsed active time, Stop & edit, and Pause / Resume. Pausing freezes active time and keeps the preview and controls usable. Repeated keys or clicks must never start parallel sessions or duplicate finalization.
4. Scene switching continues during recording where supported. Bring the selected application window to the foreground, flash its outline briefly, then retain the subtle capture glow. A failed or missing source leaves the previous capture active with a clear explanation.
5. Minimize or hide Studio while the recording continues. Restore from Dock/menu bar or the existing show/hide shortcut. Closing Studio hides the controls during a take; explicitly quitting the app follows safe stop/finalization behavior.
6. Stop finalizes the take once and opens the existing editor. Automatic click-to-zoom remains off. Z and manually placed editor zooms remain available.

Preserve existing default shortcuts: record/stop ⌘⇧R, pause/resume ⌘⇧P, whiteboard ⌘⇧B, facecam ⌘⇧W, show/hide recorder ⌘⇧H, and manual zoom Z. Show user-customized values where supported; retain release-to-save key capture and conflict explanations.

## Facecam on the desktop

- Enabling facecam shows the actual desktop camera overlay as well as enabling it for recording. It remains visible when Studio is minimized or hidden.
- Drag the facecam directly while idle or recording. Respect an explicit position lock; make Unlock position available from its context menu. Reuse source-relative normalized camera layout and timeline events so movement appears in the correct position in exports after window switches or display scaling.
- Right-click the facecam for **Hide facecam**, Lock/Unlock position, and Camera settings. Hide facecam turns off the camera layer in the take; it must not merely hide its local preview. The Studio toggle, assigned hotkey, iPad and scene state all update together.
- Camera settings retain size, shape, mirror, crop and source. Do not record the drag handle, menu, settings gear or selection outline. Keep the camera's independently recorded track/compositing path so it is not captured twice.

## Capture and lifecycle design

The recorder currently lives in `useScreenRecorder()` mounted by `LaunchWindow`; Studio settings is a separate renderer. Do not mount another recorder hook in a new control window. Keep one persistent recorder host and expose typed commands and observable state to the new Studio UI, iPad and global shortcuts. Minimizing, switching panels or closing the controller must not unmount that host, stop tracks or throttle recording timers.

Extend the existing control/status bridge with explicit phases (idle, preparing, countdown, recording, paused, finalizing, error), elapsed active duration, countdown remaining, source identity, camera/audio state and command completion. Sender validation must deliberately allow the new trusted Studio route while retaining the existing permission boundaries. Keep recorder media permissions with the existing trusted host.

Mac display capture already excludes the MistaRecorda application using ScreenCaptureKit, re-including only the intended drawing surface. Single-window capture uses a window-specific filter and separate overlay composition. Preserve both paths, the camera track and native exclusion acknowledgement. Update `prepareStudioCapture()` so it no longer hides the new Studio unnecessarily. Give control windows explicit roles rather than relying only on titles.

Do not rely solely on Electron `setContentProtection(true)` on macOS: its documentation says ScreenCaptureKit applications can still capture those windows. Exclusion must be verified in our capture filter and exported pixels. If an alternate capture backend cannot exclude the controls, hide them before starting and explain that fallback. This promise concerns MistaRecorda's own recordings; another app sharing the entire desktop controls its own exclusions.

Use a dedicated low-overhead preview feed. Reuse frame/overlay data where possible, suspend preview rendering while minimized, and keep the recording host running. Avoid opening a second full recording pipeline just for the preview. Cap preview resolution/frame rate independently of recording quality. Preserve shadow objects as iPad-only and never include controller feedback in the preview intended to represent output.

## Implementation sequence

1. Add the shared recorder state/command adapter with lifecycle and duplicate-command coverage; keep the existing recorder functional.
2. Build the new Studio shell around `RecordingScenes`, `LayerSources`, `CaptureLayers`, existing tools and the adapter. Make it the startup window. Keep the recorder host persistent and hidden without the floating bar.
3. Add accurate preview, countdown and elapsed state; connect iPad status and existing shortcuts. Integrate existing settings help/tutorial targets with the new window.
4. Add facecam context menu and verify drag/visibility synchronization and source-relative positions. Preserve glow and foreground behavior.
5. Validate native capture exclusions, finalize/play back/export a take, then package/install and push the implementation. Do not remove Claude's active AI-chart worktree; integrate through main without modifying its checkout.

## Required playtest

- Whole display and individual application-window recording with Studio visible over content; open its menus, move it, minimize and restore. Inspect exported frames for no controller, menu, countdown or glow pixels and no black holes where the controller was.
- Countdown cancel, rapid repeated start/stop, pause/resume via button and hotkey, stop while paused, restore after hiding. Confirm one playable file with correct audio and active duration.
- Switch two Chrome windows and a saved scene mid-take; verify foreground focus, transient flash, sustained glow, correct selected source, camera layout and audio state. Browser tabs remain content of a Chrome window unless an explicit tab integration is added.
- Enable facecam, drag it with Studio minimized, right-click Hide facecam, then show it by hotkey. Inspect exported positions and visibility timing, including Retina scaling and cross-display moves.
- Open/close whiteboard while recording only an application window. Confirm drawings/memes persist, the board appears in the output, and iPad shadow objects remain private.
- Pair/reconnect iPad: automatic screen start, Pan & Zoom default, controls remain synchronized, Pencil navigation does not draw. Retest soundboard audio and editable sound timing modes.
- Resize Studio to 820×620 and check every control, focus ring, shortcut hint and help target. Verify clicks outside the real window reach underlying applications.
- Compare recording smoothness with preview visible versus minimized; preview work must not introduce dropped recording frames.

## References

- [OBS overview: scenes, sources and controls](https://obsproject.com/kb/obs-studio-overview). Use the organization as a design reference; implement with existing React/Electron components.
- [Electron BrowserWindow content protection](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows).
