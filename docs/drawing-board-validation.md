# Drawing board validation

## macOS / iPad interaction update — 2026-10-14

- TypeScript, scoped lint, production bundle smoke, and all **1,155 tests across 133 files** passed. New coverage checks hidden-board mode, tablet viewport alignment, and private text filtering.
- Browser playtests used the real BoardCanvas with a mock Mac transport: typing a draft produced no scene writes; Done published one text element; Cancel preserved the existing scene; Clear removed it. Pan/zoom moved the preview and ink together while the shared viewport stayed unchanged. Fit restored the full view. Hiding the Mac overlay removed the tablet whiteboard.
- The local macOS app was packaged with the persistent signing identity, passed strict/deep signature verification, and was installed in `/Applications/MistaRecorda.app`. Its iPad pairing panel was opened successfully.
- This browser harness does not establish physical Apple Pencil/pinch behavior, real Wi-Fi latency, or the fresh-display fallback on iPad Safari. Those remain device acceptance checks. Earlier recording results are documented separately in the capture validation notes.

The sections below preserve the earlier Linux validation results; shared tablet navigation described there predates the local-only iPad navigation update.

Validation performed in a Linux cloud desktop with Electron and a separate Chromium browser connected over loopback. The cloud network policy blocked access to the LAN address, so that address was not playtested. Native installer builds additionally compile the macOS Swift and Windows helpers; that does not replace a recording test on those operating systems.

## Passed

- TypeScript typecheck and production Vite/Electron main build smoke.
- 1,075 tests across 118 files. Board coverage includes scene persistence, named scenes and assets, stale revisions, malformed geometry/images, pairing approval and expiration, restricted companion operations, overlapping requests, malformed-frame isolation, queued-operation revocation, MCP authentication and tool discovery, and capture-permission boundaries.
- Lint: no errors; 21 existing repository warnings.
- Production Electron opens the Drawing board and compact presenter windows.
- Real browser pairing waits for desktop approval, then connects; reconnect retains an approved session.
- Browser rectangle drawing appears in the desktop scene. Browser control-wheel zoom and a simulated two-finger pinch update the shared desktop viewport. Initial tablet fitting leaves the shared zoom unchanged.
- PNG import through the browser file picker creates an image element and asset. Named scene save/load restores the diagram. App restart retains the board with the overlay initially disabled.
- The official MCP SDK client connects, discovers 11 tools and reads the drawing guide. Authenticated MCP initializes, advertises instructions and tools, draws editable objects, saves a named scene and returns a clean screenshot after painting.
- Screen capture produces a live 1280×900 desktop track. The companion receives the automatic JPEG preview at 1280 pixels wide when direct WebRTC is unavailable.
- Captured screenshots are included in the how-to guide.

A production-only WebSocket optional-dependency failure and an initial tablet zoom mismatch were found through these browser tests and fixed before the final build. The WebSocket dependency stays external to the Electron bundle so its optional native acceleration resolves correctly at runtime.

## Native installer results

[Build run 38485968983](https://github.com/nikooo11/MistaRecorda/actions/runs/38485968983) succeeded for Windows x64, macOS arm64 and macOS x64 from code commit `ae84382f76dc4ee22a3425bc309a9c8b392b9996`. All three jobs completed native helper compilation, application packaging, packaged-binary smoke checks, checksums, artifact attestations and uploads. Later changes update documentation and download links only.

## Not established by this environment

- Native macOS/Windows recording excludes every presenter control while retaining the board, including controls opened after recording begins. The implementations use ScreenCaptureKit application exclusion with the clean surface excepted, and Windows capture affinity respectively.
- Physical iPad Safari, Apple Pencil pressure/palm behavior, real trackpad gestures, and direct WebRTC over Wi-Fi. The cloud test completed signaling but could not establish the direct media connection; the automatic preview fallback was exercised instead.
- Multi-monitor placement, OS permission dialogs, webcam hardware, full-screen applications and target-device GPU export with the board.
- USB pairing and direct cloud-to-desktop MCP connectivity are outside this first version. USB is deferred; cloud MCP clients need their own authenticated bridge.

## Target-device acceptance check

On a Mac or Windows PC and an iPad on the same private Wi-Fi:

1. Select the same full display in the recorder and board panel. Enable drawing, pair and approve the iPad, then tap Start screen. Confirm the live preview. Draw with finger and Pencil, add arrows/text and import a transparent PNG.
2. Deploy the board using its left-edge handle or configured shortcut. Turn Draw off on the iPad and pinch/pan; confirm only its preview moves. Tap Fit screen. Hide the board on the Mac and confirm the iPad returns to the live screen. Reopen it and confirm both scenes persist. Add a text draft and verify it remains absent on the Mac until Done; Cancel should publish nothing.
3. Record a short take. Use compact controls, pause/resume, webcam show/hide, transparent annotations and the opaque board. Open/close the editor while recording. Inspect the exported video: drawings and chosen webcam state should appear; toolbars, hint, presenter panel and zoom target outline should not.
4. Disconnect the iPad and confirm its live preview stops. Revoke pairing and verify reconnect requires approval again. Restart the app and load the saved scene.
5. Enable MCP, configure a local Codex client with the displayed session token, ask it to read the drawing guide and prepare a scene, inspect its screenshot, and save it. Disable MCP afterward and verify the old connection stops working.
