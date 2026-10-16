# iPad private reference reader

Implementation completed from WIP commit `34fd609` on base `ee16ba8`.

## Behavior

- The private reference panel has PDFs and Talking points tabs, a draggable handle,
  a full-screen/return control, and a minimize control. The Notes side button restores
  the same mounted panel, including full-screen mode when minimized there.
- React keeps a stable panel class; PDF tab sizing uses `data-pdf-open`, so tab
  changes cannot remove the hook's floating, collapsed, or full-screen classes.
- Full-screen dimensions follow the board stage, including rotation. Header controls
  and tabs remain outside the scrolling content. Reference controls have touch targets.
- The PDF viewer observes nonzero container widths, cancels superseded pdf.js renders,
  and rerenders at the current page/zoom. Resizing preserves the relative scroll position
  on the same page. Hidden tabs and minimized panels stay mounted, retaining the selected
  PDF, unsaved notes and unapplied draft edits. Each PDF retains its own page and zoom.
- New controls use the existing three-second hover help. Other panels get generic
  collapse help rather than instructions to use Notes.
- Layout is device-local. No recording, webcam, presented scene, store schema, or
  transport permission changes were made. `BoardCanvas` mounts TalkingPoints only
  when `!clean`; the recorded board surface uses `clean`.

## Cloud validation

A disposable Vite fixture used the actual TalkingPoints, PrivatePDFPanel,
useTabletPanels, HoverHelp, PresenterStore and PresentationPDFStore. Separate simulated
Mac and touch-enabled tablet pages shared a test HTTP/event transport, with a synthetic
three-page PDF and an in-memory synthetic ready draft. No AI calls, credentials or
private user documents were used. This is a UI/store integration check, not physical
pairing or a macOS recording check.

Browser assertions passed for:

- Mac import and tablet viewing; multiple PDFs and per-PDF page/zoom retention.
- PDF/Talking points tab switching without losing imperative panel classes.
- Unapplied draft edits and unsaved talking points retained across tab changes and
  minimize/restore; bidirectional saved-note sync and named note-set sync.
- Full-screen/return, Notes minimize/restore, keyboard movement and pointer dragging.
- Landscape 1194×834, portrait 834×1194 and narrow 390×844 sizing; PDF width responds.
- Three-second hover help; other floating panels collapse without reference-only controls.
- No recording, canvas mutation or webcam requests from these interactions; no page errors.

Checks: typecheck, lint (44 existing warnings), all 1,435 Vitest tests, production Vite
renderer/main/preload build, Electron CJS normalization and smoke check passed.
The restricted runner required system FFmpeg in place of the uninstalled npm binary
and a test-only loopback fallback for unavailable `os.networkInterfaces()`. Neither
workaround changes repository code. GitHub CI runs without that fallback.

The full `npm run build` packaging pipeline stops at the missing CMake requirement
for the native Whisper runtime in this runner. The production JavaScript bundles
build successfully. Native packaging/signing is deferred.

## Remaining local checks

When the Mac is open, build/sign/install locally and test physical iPad Safari pairing,
real portrait/landscape rotation, touch dragging, the on-screen keyboard and a live
recording. Confirm private reference controls stay absent from the recorded output
and that facecam remains OFF. No installation on the user's Mac was attempted in cloud.

## Local follow-up (October 16)

- Verified PR #7 merged at `2c39908`; fast-forwarded a clean local main without
  overwriting changes. Signed/installed using the existing MistaRecorda Local
  Development identity and kept facecam off.
- Real companion-server testing found an issue not exposed by the cloud Vite fixture:
  the pdf.js `.mjs` worker was served as binary, and font/decoder paths were blocked.
  Added the JavaScript/wasm/font MIME types and a restricted pdf.js asset allowlist.
  A real HTTP regression test checks these routes with `nosniff` still enabled.
- Saved talking points synced both directions between the actual Mac app and a paired
  browser. The disposable note set was removed and the original set retained.
- User confirmed the reference panel works on their physical iPad, including the
  requested expand/minimize/tab-switch and touch/rotation check.
- Added tablet Pan & zoom selection for ordinary pasted/standby images. Tap to select;
  tap again, hold, or right-click for Copy, Paste, Duplicate, Remove from screen, and
  Delete. Dragging respects canvas zoom. Copy is an in-app clipboard, also available
  after deletion. Exit choice is stored on the image (default Spin out).
- Animated removal immediately saves a deletion tombstone, with a 450 ms read-only
  outro on tablet and clean Mac surfaces. It does not depend on a tablet timer completing;
  Delete bypasses the outro. Private shadow images remain excluded from Mac output.
- Isolated browser checks passed selection, second tap, 700 ms hold, copy/duplicate,
  paste after removal, immediate deletion, and dragging at 105% zoom without extra ink.
  These mouse-driven checks do not substitute for physical Apple Pencil validation.
- Typecheck, lint (existing warnings), all 1,439 tests, production bundle build,
  Electron CJS smoke and signed-package binary smoke passed before final installation.
- Final combined package installed successfully; `codesign --verify --deep --strict`
  passes. Startup is currently waiting in macOS Keychain access, so real PDF import
  after the MIME fix, a live recording privacy check, and the new controls on physical
  iPad/Apple Pencil remain unverified. The earlier physical iPad confirmation applies
  to the reference-panel layout, not the newly added image controls.
