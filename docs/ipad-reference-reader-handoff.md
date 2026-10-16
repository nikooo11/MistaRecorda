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
