# Drawing board, iPad and Codex

MistaRecorda embeds the [Excalidraw](https://github.com/excalidraw/excalidraw) editor for editable shapes, arrows, handwriting, text, images and reusable groups. USB pairing is deferred; this version uses your local Wi-Fi network.

## Start on your computer

1. Open **Board** on the recorder. Choose the display you will record and enable the drawing overlay **before** recording. Select that same full display in the recorder's source picker.
2. Choose **Draw on computer** for desktop editing, or connect your iPad below. Select an arrow, shape, text or freehand tool from the Excalidraw toolbar. Click **Done drawing** to return mouse control to your desktop.
3. To deploy the opaque whiteboard, move your pointer within 12 pixels of the selected display's left edge. The grey **Press Space** hint appears; press Space. The board slides over the screen. **Return to screen** restores your transparent annotation scene. The two scenes retain their contents independently.
4. Pinch with two fingers on the board to pan/zoom, or use its zoom controls. Desktop, iPad and recorded board share the same view. On a trackpad, pinch zooms and two-finger scrolling pans. This changes the drawing viewport, not the underlying desktop application's zoom.
5. Use **Recording shows** to choose screen plus drawings, screen only, or the opaque board. The choice is visible immediately. Drawings persist when hidden and across app restarts. The overlay starts disabled after reopening the app.

Use **Clear scene** only when you want to remove that scene's drawings and image tray. Named saved scenes remain available. **Save scene** stores the current scene under the entered name; saving the same name replaces it. **Browse scenes** loads a prepared scene in place of the active scene after confirmation.

## Connect an iPad

1. Put both devices on the same trusted Wi-Fi network. In **Board → Connect iPad**, click **Show pairing QR**. Choose your Wi-Fi address if several interfaces appear.
2. Scan with the iPad camera and open the page in Safari. The QR expires in five minutes; generate another if necessary.
3. Keep the page open. Click **Approve** for the device on your computer. Then tap **Start screen** on the iPad. The computer streams its selected display without audio; the iPad does not need microphone or camera access.
4. Select the freehand tool to draw with a finger or Apple Pencil. Use arrows, circles and text for structured explanations. The opaque board also appears on the iPad when deployed. Two-finger navigation changes the shared board viewport.
5. **Reconnect** resumes an approved session in the same browser tab. Tap **Start screen** again after a connection failure or display change. **Disconnect** revokes a device; **Stop sharing** closes all companion connections.

The initial page and drawing synchronization use local HTTP/WebSocket, so use a trusted private network. WebRTC carries the screen stream when available. If the network blocks a direct WebRTC connection, an automatic lower-frame-rate JPEG preview uses the approved local WebSocket connection; that fallback is also unencrypted on local HTTP. Guest Wi-Fi isolation, VPNs, firewalls or denied local-network access can prevent connection. Allow MistaRecorda on your private network. Pairing approval is required even with the QR link; do not share the link publicly. There is no remote Internet relay or USB companion app in this version.

## Keep assets ready

Paste a screenshot using your platform's paste command, or choose **Import image** for PNG, JPEG or WebP (up to 12 MB). Transparent PNG backgrounds are preserved. **Standby images** holds imported images for repeated placement. Select related shapes and use Excalidraw's Library to keep reusable arrows or grouped drawings. The library is shared with connected devices and saved with the board.

Undo/redo belongs to the active editor. Work from one editing device at a time: conflicting edits show an error instead of silently replacing newer work. Stop drawing before saving/loading a scene or switching tools from another device.

## Recording controls

Click **Compact controls** for a small presenter window showing recording, paused or idle state and elapsed time. **Board settings** expands it again. It provides Start/Stop, Pause/Resume and Show/Hide webcam buttons. Keyboard shortcuts are **Ctrl/⌘ + Shift + R**, **Ctrl/⌘ + Shift + P**, and **Ctrl/⌘ + Shift + W** respectively. Other applications may reserve these shortcuts; the buttons remain available.

Native macOS capture filters out MistaRecorda's presenter/editor windows; Windows uses capture exclusion for those windows. The separate clean drawing surface is included. Board recording is supported on macOS and Windows; Linux can preview/edit the board but requires the overlay disabled to record. Use a full display capture with the board enabled; individual-window capture cannot contain a separate overlay. In board mode the webcam is included in the clean surface, so its shown/hidden state is recorded into the video rather than a separately editable webcam track. The normal recorder retains its existing webcam workflow when the drawing overlay is disabled.

Make a short sample recording on your computer before a tutorial to confirm permissions, display selection, webcam and capture exclusion. Native capture and Apple Pencil behavior require real target-device testing; a Linux cloud desktop cannot validate them.

## Let Codex prepare diagrams

1. Open **Board → Codex / MCP → Enable MCP drawing tools**. Copy the configuration shown there into your Codex MCP configuration. It uses a localhost HTTP URL and `bearer_token_env_var = "MISTARECORDA_MCP_TOKEN"`.
2. Set that environment variable in the environment that starts Codex to the copied session token. Keep the token private. Restart/reconnect Codex as required by your client. The URL and token change when the server/app restarts.
3. Ask: “Read MistaRecorda's drawing guide, prepare an editable diagram explaining [topic], inspect it, and save it as [scene name].” The server advertises a drawing guide, a prepare-tutorial prompt and tools to inspect, draw, update, delete, frame, save/load and screenshot the board.
4. For an additional reusable Codex skill, copy [the `mistarecorda-board` folder](skills/mistarecorda-board/SKILL.md) into a skill directory supported by your Codex installation. The server's built-in instructions work even without installing this file.

Codex running on the same computer can reach this server directly. A hosted/cloud Codex session requires a separately configured authenticated bridge to your computer; enabling MCP does not create one. Do not expose the unauthenticated companion page or your MCP token publicly.

To prepare a board from a YouTube tutorial, give Codex an accessible transcript and relevant frames, or authorized tools that can obtain them. The drawing server itself does not watch or download YouTube. Codex can turn that source material into diagrams **before** you record, and save multiple scenes for your tutorial.
