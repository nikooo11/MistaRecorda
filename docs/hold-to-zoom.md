# Hold or tap to zoom

Hold **Z** to follow your cursor; release to zoom out. Tap **Z** to lock focus at the initial cursor position; tap again to zoom out. Your actual desktop never magnifies. An excluded outline shows the intended framing, and playback/export apply the smooth transition.

The Zoom button on the recorder opens shortcut and magnification settings. The default is Z at 1.8×; a tap lasts less than 250 ms. Select a modifier combination if the recorded app already uses Z. Global keyboard input on Mac requires the relevant Accessibility/Input Monitoring permission.

Held intervals import as **Auto** zooms and follow recorded cursor telemetry. Tapped intervals import as **Manual** zooms. In the editor, select an interval to change its target, amount, timing or duration, or delete it. Saved projects retain those edits, including deletion of all recorded zooms. Raw recordings keep initial markers in a separate `.zooms.json` sidecar.

Pausing, stopping or changing the recorded window ends the current zoom. Release and press again after a pause. Paused time is excluded from the take.

See [Capture studio](capture-studio.md) for recording, drawing, voice presets and sound shortcuts. The previous screenshots and Linux playtest described the former gesture mapping; they are not evidence for this revised Mac build. Current results and outstanding physical-device checks are in [validation](capture-studio-validation.md).
