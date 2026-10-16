# Capture studio

## Simple defaults

MistaRecorda is a screen recorder first. New installations use automatic capture quality, a three-second countdown, microphone and computer audio enabled, face camera off, and the capture glow on. New scenes start with facecam and both audio inputs on. Existing audio choices are preserved. Choose the screen or application window you want to show; scenes are optional. macOS still requires the initial device/capture approvals.

## Record a take

Choose your source, microphone and computer audio in the recorder. Native Mac recording keeps the recording studio available and excludes it from capture. Other utility panels hide when a take starts and can be reopened. Alternate capture paths hide the recorder before capture begins. **⌘/Ctrl + Shift + H** brings the recorder back. **⌘/Ctrl + Shift + R** starts or stops the take using the same shortcut; **⌘/Ctrl + Shift + P** pauses or resumes.

On macOS, the **Recording** menu also restores the recorder, starts/stops a take, pauses/resumes, toggles the drawing board, and opens iPad pairing.

Native macOS display capture excludes the entire MistaRecorda control application, including windows opened after recording starts. The separate clean drawing surface is explicitly included when drawing is enabled. The capture glow and zoom target never belong to the source video. Windows uses capture protection. Linux cannot guarantee exclusion of controls from full-display capture.

## Zoom without changing your desktop

- **Hold Z:** follow the cursor while held; releasing ends the zoom.
- **Tap Z:** lock the zoom at the initial cursor position. Tap again to zoom out.
- The default tap threshold is 250 ms. The Zoom settings button changes the shortcut and magnification.
- The outline is a local guide. The original desktop remains at normal scale. Playback and export apply smooth zoom transitions; timing, target and magnification remain editable in the timeline.

Pause, stop and window changes end an active zoom. A bare Z is also delivered to the app being recorded, so choose a modifier shortcut when that app uses Z.

## Drawing studio

**Include drawings in recording** is on by default. It includes screen ink, the whiteboard, laser pointer and deployed objects. Presenter controls and shadow notes stay private. The desktop remains clickable until you choose **Draw on screen**. Choose the matching display in Drawing options; native Mac window recording also includes the whiteboard and annotations.

Move to the far-left edge to reveal a narrow board handle, then **click** it. The framed whiteboard swings into view. **Put board away** swings it back left and retains the drawing. **⌘/Ctrl + Shift + B** toggles it from another app. Hovering alone does not deploy it.

**Draw on screen** opens the transparent drawing editor; **Done drawing** gives the mouse back to the desktop. The editor's tools remain excluded from the recording. The recorded clean surface contains the drawings. The screen scene and whiteboard scene retain separate content. On the Mac, drag the dotted grip at the left of the hand/selection toolbar to move it. It stays inside the usable screen and resets near the top when reopened; moving controls does not move your drawings.

In the **iPad** tab, generate a pairing QR. Scan it on an iPad on the same private Wi-Fi, approve that device on the computer, and the screen preview starts automatically in Pan & zoom mode. Enable **Draw** to draw with a finger or Apple Pencil. The connection uses local WebRTC, with a lower-frame-rate preview fallback. Actual latency depends on the computer, iPad and network.

Use **Drawings** to save and load drawings; **Settings** selects the display and recording output. Physical iPad/Pencil testing is still required for this build.

## Recording scenes and camera

Open **Capture settings → Recording** to view the main shortcuts. **⌘/Ctrl + Shift + W** toggles the face camera; click the shortcut to change it. Camera visibility and movement are recorded as source-time cues and are respected by preview, saved projects and export. The camera can first be enabled after recording starts. Drawing capture also keeps the camera as a separate editable video layer.

**Scenes → New scene** starts with a screen/window, facecam, both audio inputs, and a soft camera frame. **Sources & layout → Add source** adds images/GIFs, videos, or music; imports are copied into app storage. Use each source’s gear to rename, position, resize, set opacity, volume or looping, and change order. The first media item is on top, with drawings and facecam above media. The whiteboard covers screen media while open. Music starts at 20% volume. Videos and music start at recording start or scene recall, and pause with the take; non-looping clips hold their final frame. Scene audio is included in the finished recording. Use headphones to avoid speaker playback entering the microphone.

Each scene saves audio on/off and camera placement/frame. **Clean**, **Soft frame**, and **Accent** frames remain editable; border and shadow follow the camera into preview and export. Assign a shortcut beside a scene or click it to recall. Scenes do not start recording. During native Mac window capture, window scenes can change the source and bring it forward. Switching to a different display requires stopping first. The central source snapshot is not a live composite preview.

## Window shortcuts and sounds

Open the gear button for **Capture settings**.

**Window shortcuts:** assign up to six open application windows. Defaults are **⌘/Ctrl + Alt + 1–6**; click a shortcut field and press your preferred combination. Tab moves to the next field; Backspace clears a shortcut. Start a native Mac **window recording**, then use these shortcuts to change the captured window without ending the take. Differently sized windows fit the original video frame. Native Mac window capture also composites the whiteboard and screen drawings.

**Sound effects:** import WAV, MP3, M4A, OGG, FLAC or AAC files up to 25 MB and two minutes. Preview before recording, set volume and assign shortcuts. Sounds play on the Mac. **Include soundboard in recording** is on by default and mixes them into the recording once. Turn it off to keep movable sound clips in the editor; use headphones so monitoring does not enter the microphone. Paused triggers are ignored. **Love** keeps an item near the top across projects; **Favorite** marks it for the current take and resets afterward. Hover these controls for their explanations. Keep the original recording and its `.sounds.json`/`.sound-N.wav` sidecars together until saving a project.

**Recording:** review shortcuts and enable or disable the subtle capture glow. Settings that change a take are locked while recording. Help appears after hovering or focusing a supported control for three seconds.

## ElevenLabs voices and sharing

Voice processing controls appear after recording in the editor; the recording soundboard can also queue voice choices for later processing. Open the waveform **Voice / ElevenLabs** sidebar. Its compact tuning controls stay in place while only the voice list scrolls. Use **My voices**, **Library**, **Favorites**, or **Presets**, and search to narrow the list. The play button auditions a sample without selecting it.

Recording always captures the original microphone. Click **Use** to select a voice; the row shows **Selected**. Selecting, favoriting, importing, or saving tuning never processes audio. Click **Process voice via ElevenLabs** explicitly when ready. Successful processing switches playback and export to the changed microphone; **Mic audio → Original** restores the original. Computer audio and the original microphone remain intact. Takes without an isolated microphone explain why conversion is unavailable.

The **Export** menu contains a compact voice selector, preview, favorite button, preset shortcut, and **Change microphone voice** checkbox. With voice change enabled, **Export video** stays disabled until the selected voice and tuning have been processed. Changing either makes processing necessary again. Disabling voice change permits exporting the original. A favorite is selected automatically; starring a team preset selects its shared voice and tuning. With several favorites, the most recently starred choice is selected and retained on restart. GIF export has no audio and does not require voice processing.

The conversion-model dropdown lists models the ElevenLabs API reports as supporting voice conversion. Per-voice quality labels reflect supplied model metadata; they do not imply every listed model supports speech-to-speech. Missing metadata is shown honestly.

Use a voice row’s actions to make a preset, then export `.mpvoice` and send that file to another MistaRecorda user. Import through **Import preset…** or **File → Import Voice Preset**. Presets contain voice references and settings, never your API key. Each recipient needs their own ElevenLabs key and access to the referenced voice.

**Connect iPad** is available in the recorder, editor toolbar, and Recording menu. Choose **Show pairing QR**, scan with the iPad camera on the same Wi-Fi, approve the device, then start the stream. Pairing codes expire after five minutes and can be renewed.

The implementation uses ElevenLabs' [Voice Changer endpoint](https://elevenlabs.io/docs/api-reference/speech-to-speech/convert) and [voice listing](https://elevenlabs.io/docs/api-reference/voices/search). A real account loaded voices, completed preset export/import, and converted a synthetic spoken microphone sample. The changed track was selected in the editor and exported successfully; the exported audio matched the changed microphone track. PCM 44.1 kHz and MP3 192 kbps depend on the ElevenLabs subscription tier; an explicit output-format denial falls back through MP3 192 to MP3 128.

See [validation and remaining device checks](capture-studio-validation.md) before treating this as a verified release.

## Permissions and local builds

The recorder checks Screen Recording and Accessibility quietly. A missing grant is shown before the countdown with an explicit **Open Settings** action. Camera and microphone permissions are requested when those inputs are used. Merely displaying saved voice settings does not unlock Keychain; voice API actions still use encrypted key storage.

Local builds now use the persistent **MistaRecorda Local Development** certificate in this Mac’s login Keychain. Use `npm run package:local:mac` after building; it refuses a missing certificate or hash-only identity. Keep the installed copy in `/Applications` and reuse the certificate. Switching certificates or installing an ad-hoc development artifact can invalidate previous grants. See [local signing](local-mac-signing.md). Full Disk Access and passwordless sudo do not resolve recording grants. Source refreshes and native helpers check access without repeatedly requesting it.

## Interface conventions

Capture settings uses a fixed category sidebar, including one **Setup** tab for OpenAI and ElevenLabs keys. Paste and save each key once; encrypted keys stay on this computer until replaced or removed. A new computer needs its own setup. Expired or revoked keys must be replaced. Testing a key contacts its provider only when requested. Settings apply through their existing controls; shortcut fields capture a key or combination on release and explain conflicts. The footer identifies the selected recording source. Drawing, iPad pairing and saved drawings share compact tabs with a fixed recording transport. Voice conversion remains in the editor after recording.

Visual references: [OBS settings](https://obsproject.com/kb/OBS-Studio-Overview) for category navigation and aligned controls; [DaVinci Resolve Fairlight](https://www.blackmagicdesign.com/products/davinciresolve/fairlight) for compact grouping and restrained status colors. Reference images inform layout; they are not shipped as application assets.

## Layers and camera placement

**Capture settings → Layers** has camera position presets, size, shape, mirroring and position lock. Drag the floating camera directly, even while recording. Its protected preview stays visible when the recorder controls are hidden. Moving it during a take records placement cues; idle gaps hold the position. Disabling the floating preview leaves camera recording enabled. Linux hides the floating camera during capture because reliable window exclusion is unavailable there.

In the editor, **Layers** lists text, images, shapes and blur overlays, plus the camera and base screen recording. Add an overlay at the playhead, select it to edit its content, drag it in the preview, hide/show it, change its stacking order or remove it. Undo restores changes. Timeline tracks control timing. Drawing captured live remains part of the base video. **Webcam → Placement** shows the playhead time and X/Y fields. Scrub or use Previous/Next point, then change X/Y or a position preset to correct that point while preserving the other recorded movement. Add/Remove point controls adjust the path, and playback/export interpolate between points. Changes pause playback and participate in undo and project saving. Reset restores the default camera layout.

## Recorder panel buttons

Board, iPad, Capture settings and Zoom toggle their menus. Click once to open, then again to hide. Opening Settings, iPad or Zoom leaves the recording studio visible and opens a companion window. Repeating its button closes that panel. Switching between Board and iPad opens the requested tab rather than hiding the shared panel. The editor sidebar and its Connect iPad button also toggle open/closed. Menu-bar commands explicitly open their destination.


## Studio backgrounds

After recording, open **Scene → Background → Studio backgrounds**. Choose Blueprint, Contour, Graphite, or Paper. Each sets an editable frame margin, corner radius, and shadow around the screen recording. Blueprint and Contour include an optional **Motion** toggle for a quiet eight-second loop. Backgrounds remain behind screen footage and the separate camera layer in playback and export; they add no work to live capture. All four designs are original, bundled offline, and may be used in commercial recordings without attribution. Existing custom image/video backgrounds remain available below the short menu.

The webcam cropper previews the recorded camera at the current playhead and respects **Mirror webcam**. Crop the recorded frame, not the current live camera image; this keeps the preview consistent with the exported take.

## Live production controls

See [Live recording controls](live-production.md) for window focus and capture glow, whiteboards in window recordings, the shared soundboard, timed narration voices, virtual-microphone streaming and uploaded memes. The [October 15 validation record](live-production-validation.md) distinguishes completed recording checks from the remaining Keychain and physical audio-device tests.
