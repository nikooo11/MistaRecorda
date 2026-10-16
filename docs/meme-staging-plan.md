# Meme staging and effects

- Tap a thumbnail, or press and drag it out of the library. Keep the draft private at 50% opacity until Deploy.
- Drafts start about 240 screen pixels wide, divided by the current canvas zoom. Pointer coordinates, drag distances and resize handles use the same canvas transform on Mac and iPad.
- Move and proportionally resize the draft, then Deploy or Cancel. Sounds, lifespan and effects start only on deployment. Images use the same staging controls.
- Live memes: tap to exit, drag to move (keeps the meme on screen while adjusting), right-click on Mac / long-press on iPad for Keep on screen, Remove and Shake. Mac options use a native menu excluded with app controls.
- Per-meme gear settings persist in the shared library: entrance/exit, duration, attached library/uploaded sound, optional object shake and optional output screen shake. Default shake is off; bounded strength and duration avoid uncontrolled effects.
- Screen shake affects the captured output and live studio preview, including single-window recording. Presenter controls remain steady. iPad shows the same effect on its content. The Mac's underlying application windows are not physically moved.
- Validate 0.5×, 1× and 2.56× coordinates; draft cancellation and no pre-deploy side effects; touch/pen/mouse drag versus tap; repeated/expired actions; persistence and bundle round trips; native recording and protected controls.

## Validation — 2026-10-16

- Full suite: 182 files / 1,406 tests passed. Final focused placement, preferences and lifecycle tests also passed. TypeScript, renderer/main production builds, Electron startup smoke check, and arm64/x64 native builds passed.
- Companion browser with real pointer input: drag a thumbnail in Pan & zoom, resize the private preview, move, deploy, move again, open its actions, and dismiss. No drawing strokes were created by those interactions.
- At 255% zoom the initial draft remained 240 CSS pixels wide. After resizing, preview and deployed bounds differed by less than 0.02 CSS pixels. A subsequent live drag moved the object exactly 150 × 70 CSS pixels. Unit cases cover zoom 0.25, 0.59, 1, 1.83, 2.56 and 5, with scroll and canvas offsets.
- Paired a browser with the installed Mac app. Private preview remained absent from output until Deploy. Saved per-meme shake and duration preferences survived the recording/editor transition. An uploaded 0.25-second WAV became available in both the meme sound picker and Mac soundboard. Restored the original Chad Pepe defaults and removed the test sound from the library.
- Saved a 16.9-second native screen recording (3024 × 1964 H.264 + AAC, 890 frames). Frame inspection showed the meme appearing only on deployment, background movement during the configured 0.6-second shake, and a steady picture afterward. Studio and staging controls were absent from the recording.
- Signed package and installed signature verified with the existing persistent local identity. No new privacy permissions or drivers required.
- Physical Apple Pencil gestures and Mac transparent-overlay drag/right-click are not covered by the browser test and remain unverified. Single-window screen shake compiles through the shared compositor but was not separately recorded in this playtest.
- User requested facecam remain off during testing. Launch scene preparation now explicitly leaves the camera off; manually recalling a scene still honors its camera setting. The startup regression test verifies no `webcam-on` command is emitted. The test recording is saved as `QA meme staging and shake`.

## Private image placement follow-up — 2026-10-16

- Clicking/tapping outside a private draft or pressing Escape cancels locally, including while disconnected. A canvas cancellation consumes the pointer-down so it cannot start an ink stroke. Offline deployment is disabled while move, resize, tilt and Cancel remain available.
- Eight edge/corner handles preserve aspect ratio. The rotation handle and Tilt slider use radians internally; rotated resizing keeps the opposite anchor fixed. Native desktop hit-testing follows the rotated shape, and saved meme geometry retains tilt.
- Standby images now use the same drag-from-tray, private preview and Deploy workflow. Imported images also preview before deployment. Starting width stays around 240 CSS pixels regardless of canvas zoom. Deployment explicitly waits for the Mac save acknowledgement, including in Pan & Zoom mode, without enabling freehand drawing.
- Placement controls sit above floating menus so Actions cannot hide Cancel/Deploy.
- Validation: TypeScript passed; full suite 184 files / 1,424 tests passed. Real browser pointer drags tested moving, resizing before/after tilt, dragging a meme and standby image out of their trays, offline cancellation, and saved tilted image placement in Pan & Zoom at 155% zoom. Geometry regressions cover zoom 0.25–5 and all eight tilted resize anchors. This is browser companion validation, not physical Apple Pencil verification.
- Production renderer/main build and Electron startup smoke passed. The local signed package attempt was blocked by macOS Keychain (`errSecInternalComponent`) while the Mac was locked; installation awaits an unlocked Mac. Facecam was kept off.
