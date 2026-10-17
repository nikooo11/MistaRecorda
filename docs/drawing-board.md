# Drawing board, iPad and Codex

MistaRecorda embeds the [Excalidraw](https://github.com/excalidraw/excalidraw) editor for editable shapes, arrows, handwriting, text, images and reusable groups. USB pairing is deferred; this version uses your local Wi-Fi network.

## Start on your computer

1. Open **Board** on the recorder. Choose the display you will record and enable the drawing overlay **before** recording. Select that same full display in the recorder's source picker.
2. Choose **Draw on computer** for desktop editing, or connect your iPad below. Select an arrow, shape, text or freehand tool from the Excalidraw toolbar. Click **Done drawing** to return mouse control to your desktop.
3. To deploy the whiteboard, move your pointer to the selected display's far-left edge and click the narrow board handle. The framed board swings over the screen. **Put board away** swings it back off the left edge. **⌘/Ctrl + Shift + B** toggles it directly. Hovering alone only reveals the handle. Returning to the screen restores your transparent annotation scene. The two scenes retain their contents independently.
4. Pinch with two fingers on the board to pan/zoom, or use its zoom controls. Desktop navigation changes the shared drawing viewport. On a trackpad, pinch zooms and two-finger scrolling pans. iPad navigation magnifies its own screen preview and ink together without moving the recorded annotations or changing the desktop application's zoom.
5. Use **Recording shows** to choose screen plus drawings, screen only, or the opaque board. The choice is visible immediately. Drawings persist when hidden and across app restarts. The overlay starts disabled after reopening the app.

Use **Clear drawings** or **Clear whiteboard** to empty the current scene immediately. Standby images and named saved scenes remain available. On the Mac, **Escape** puts an open whiteboard away; when annotating the screen, it clears screen drawings. **Save scene** stores the current scene under the entered name; saving the same name replaces it. **Browse scenes** loads a prepared scene in place of the active scene after confirmation.

![Clean drawing surface created through MCP](screenshots/board-clean.png)

The clean surface contains the drawing without editor toolbars. This screenshot is from the Linux desktop playtest, not a native Mac/Windows recording.

## Connect an iPad

1. Put both devices on the same trusted Wi-Fi network. In **Drawing studio → iPad**, click **Show pairing QR**. Choose your Wi-Fi address if several interfaces appear.
2. Scan with the iPad camera and open the page in Safari. The QR expires in five minutes; generate another if necessary.
3. Keep the page open. Click **Approve** for the device on your computer. Then tap **Start screen** on the iPad. The computer streams its selected display without audio; the iPad does not need microphone or camera access.
4. Tap **Pan & zoom** to turn on the highlighted **Draw** button. It enables transparent screen annotation on the Mac; do this before starting a recording. Draw with a finger or Apple Pencil, or choose arrows and circles. Tap **Draw** again for navigation. Pinch/pan magnifies the iPad preview and ink together, leaving recorded annotation positions unchanged. **Fit screen** restores the full display.
5. The iPad follows the Mac: hiding the whiteboard returns to the live screen. **Open whiteboard** deploys it on the Mac without showing desktop editing tools. **Clear drawings** / **Clear whiteboard** removes the current scene's objects on both devices without restarting the preview. The laser tool produces a temporary trail on the Mac and recording.
6. For text, choose the Text tool and tap a position. Type in the private bubble, then tap **Done** to publish it to the Mac and recording. **Cancel** discards the draft. The keyboard layout is controlled by iPadOS; the app cannot force a floating keyboard to become full-size.
7. **Reconnect** resumes an approved session in the same browser tab. Tap **Start screen** again after a connection failure or display change. Restarting MistaRecorda requires a fresh QR code and pairing approval. **Disconnect** revokes a device; **Stop sharing** closes all companion connections.

The initial page and drawing synchronization use local HTTP/WebSocket, so use a trusted private network. On macOS, a ScreenCaptureKit helper streams a clean display preview over the approved WebSocket connection, excluding MistaRecorda windows. The tablet draws ink locally and the Mac renders the same objects independently, avoiding delayed duplicate strokes in the preview. The preview requests up to 30 frames per second, drops queued frames under network pressure, and sends a heartbeat for static screens. Windows uses WebRTC when available with a lower-frame-rate JPEG fallback. A stalled preview requests this fallback and is hidden if no new frames arrive; tap **Start screen** to retry. The local HTTP/WebSocket preview is unencrypted. Guest Wi-Fi isolation, VPNs, firewalls or denied local-network access can prevent connection. Allow MistaRecorda on your private network. Pairing approval is required even with the QR link; do not share the link publicly. There is no remote Internet relay or USB companion app in this version.

![Browser companion at a tablet-sized viewport](screenshots/board-companion.png)

The browser companion at 1024×768. Physical iPad/Pencil testing remains separate from this browser playtest.

## Keep assets ready

Paste a screenshot using your platform's paste command, or choose **Import image** for PNG, JPEG or WebP (up to 12 MB). Transparent PNG backgrounds are preserved. **Capture Mac screen** captures a still, opens it as an editable image on the whiteboard, and saves it to **Standby images** on both devices. When the clean Mac preview is running, the still excludes the app controls and ink. **Standby images** holds imported images and captured stills for repeated placement, including after clearing or restarting. Select related shapes and use Excalidraw's Library to keep reusable arrows or grouped drawings. The library is shared with connected devices and saved with the board.

**Select** lets you move and resize each independent stroke, shape, image or text object. **Select multiple** toggles objects by tapping them; then use **Group** or **Ungroup**. **Copy**, **Paste**, and **Duplicate** are available in the object bar, including on the iPad without a keyboard.

Undo/redo belongs to the active editor. Work from one editing device at a time: conflicting edits show an error instead of silently replacing newer work. Stop drawing before saving/loading a scene or switching tools from another device.

## Recording controls

Recorder menus now hide before recording starts. **⌘/Ctrl + Shift + H** shows or hides the recorder toolbar. New native Mac capture excludes the entire control app, including panels opened during a take. See the [current Capture studio guide](capture-studio.md); screenshots below show the earlier interface.

Click **Compact controls** for a small presenter window showing recording, paused or idle state and elapsed time. **Board settings** expands it again. It provides Start/Stop, Pause/Resume and Show/Hide webcam buttons. Keyboard shortcuts are **Ctrl/⌘ + Shift + R**, **Ctrl/⌘ + Shift + P**, and **Ctrl/⌘ + Shift + W** respectively. Other applications may reserve these shortcuts; the buttons remain available.

Native macOS capture filters out MistaRecorda's presenter/editor windows; Windows uses capture exclusion for those windows. The separate clean drawing surface is included. Board recording is supported on macOS and Windows; Linux can preview/edit the board but requires the overlay disabled to record. Use a full display capture with the board enabled; individual-window capture cannot contain a separate overlay. In board mode the webcam is included in the clean surface, so its shown/hidden state is recorded into the video rather than a separately editable webcam track. The normal recorder retains its existing webcam workflow when the drawing overlay is disabled.

Make a short sample recording on your computer before a tutorial to confirm permissions, display selection, webcam and capture exclusion. Native capture and Apple Pencil behavior require real target-device testing; a Linux cloud desktop cannot validate them.

![Compact presenter controls](screenshots/board-presenter.png)

## Soundboard and AI figures

**Soundboard** opens a compact tray on the iPad or Mac presenter panel. Before recording, **Preview** plays a sound locally. During recording, **Add to take** inserts the sound at the current recording time; it is mixed on playback/export, not played through the speakers during capture. Paused recordings reject new cues. Import sounds and assign hotkeys in Capture settings → Sound effects. The control tray is excluded from native recording.

The small **AI** microphone button opens a private figure assistant. In Mac Drawing studio → Setup, enter your own OpenAI API key. It is encrypted by Electron's OS-backed safe storage on the Mac and never sent to the companion device or saved in a shared preset.

Type a topic or tap **Listen on Mac** for up to 20 seconds, then review the transcript and tap **Find visuals**. The local HTTP iPad page cannot request its microphone; listening uses the Mac microphone, with keyboard dictation as an alternative. The request sends the topic to OpenAI, uses GPT-6 Astra with at most two research subagents, and returns up to three sourced suggestions. Each research session has a $1 spend limit and is deleted after completion/cancellation. Transcription and explicit image generation have separate API charges. Set project billing limits in your OpenAI account.

A suggestion offers **Chrome link** to open its source on the computer, **Add to whiteboard** for an available image, and **Illustrate** to edit a generation prompt. Generated images are previewed privately and added only after another tap. Sources with unverified reuse rights say so. Nothing is automatically placed in the recording. If hosted-session cleanup fails, **Retry cleanup** must succeed before another research request.

## Let Codex prepare diagrams

1. Open **Drawing studio → Setup → Codex / MCP → Enable MCP drawing tools**. Copy the configuration shown there into your Codex MCP configuration. It uses a localhost HTTP URL and `bearer_token_env_var = "MISTARECORDA_MCP_TOKEN"`.
2. Set that environment variable in the environment that starts Codex to the copied session token. Keep the token private. Restart/reconnect Codex as required by your client. The URL and token change when the server/app restarts.
3. Ask: “Read MistaRecorda's drawing guide, prepare an editable diagram explaining [topic], inspect it, and save it as [scene name].” The server advertises a drawing guide, a prepare-tutorial prompt and tools to inspect, draw, update, delete, frame, save/load and screenshot the board.
4. For an additional reusable Codex skill, copy [the `mistarecorda-board` folder](skills/mistarecorda-board/SKILL.md) into a skill directory supported by your Codex installation. The server's built-in instructions work even without installing this file.

Codex running on the same computer can reach this server directly. A hosted/cloud Codex session requires a separately configured authenticated bridge to your computer; enabling MCP does not create one. Do not expose the unauthenticated companion page or your MCP token publicly.

To prepare a board from a YouTube tutorial, give Codex an accessible transcript and relevant frames, or authorized tools that can obtain them. The drawing server itself does not watch or download YouTube. Codex can turn that source material into diagrams **before** you record, and save multiple scenes for your tutorial.

For the exact checks performed and remaining device checks, see [Drawing board validation](drawing-board-validation.md).

## Tablet recording controls

A reserved edge bar provides Record/Stop and Pause/Resume from every companion panel. It is outside the mirrored canvas and is not a drawing object. The gear chooses one of four corners and optional Stop confirmation for takes of at least five seconds. Minus collapses to a timer pill; tap it to expand. Preferences stay in that browser.

The Mac owns recording state. Tablet requests have explicit intentions, wait for status confirmation and ignore repeat taps. A shared Mac gate prevents concurrent remotes from reversing a pending action. Pause is unavailable while idle; paused takes display amber. Disconnect disables controls and reconnect fetches current Mac status. No camera is activated by these controls.

Validation: 1,457 tests and TypeScript pass. Browser fixture verified pending feedback, timer, pause, collapse, corner layout and a simulated Mac-side stop. WebSocket integration verifies pairing approval and rejects forged status. Remaining manual check: pair a physical iPad, start/pause/resume/stop a disposable take and repeat using the Mac shortcut while Notes/PDFs/memes are open. Keep facecam off.

## Arrange iPad presenter panels

Each floating panel has two different controls:

- **Minus / plus** collapses to a small title bar or expands it. The title bar remains visible and draggable.
- **Yellow circle with a black minus** minimizes the panel into the right side dock. Tapping its right-side icon also minimizes it. Tap the icon again to reopen it **expanded**, even if it was collapsed before minimizing.

Drag the title to place panels anywhere in the iPad workspace, including the margins around the Mac image. Position is remembered in that browser. Multiple panels can stay open at once. Minimizing preserves search text, PDF page and unsaved notes. Colors and drawing tools gain a recovery icon when minimized. Notes can also fill the iPad for private reading; reopening from the dock returns to the expanded floating panel. Recording controls remain in their reserved edge bar and collapse to a timer pill so they are always reachable.

Browser playtest: dragged a collapsed Memes panel, minimized it with the yellow control, and reopened it expanded at the dragged position. Soundboard search survived collapse → side-icon minimize → reopen; Colors returned through its added dock icon; full-screen Notes returned expanded after collapse/minimize. These are browser checks of the real components, not a physical Apple Pencil test. TypeScript and all 1,461 Vitest tests pass.
