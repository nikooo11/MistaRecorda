# Capture studio

## Simple defaults

MistaRecorda is a screen recorder first. New installations use automatic capture quality, a three-second countdown, the default microphone enabled, system audio and face camera off, and the capture glow on. Existing audio choices are preserved. Choose the screen or application window you want to show; scenes are optional. macOS still requires the initial device/capture approvals.

## Record a take

Choose your source, microphone and computer audio in the recorder. Starting a take hides MistaRecorda's open panels and recorder toolbar before capture begins. **⌘/Ctrl + Shift + H** brings the recorder back. **⌘/Ctrl + Shift + R** starts or stops the take using the same shortcut; **⌘/Ctrl + Shift + P** pauses or resumes.

On macOS, the **Recording** menu also restores the recorder, starts/stops a take, pauses/resumes, toggles the drawing board, and opens iPad pairing.

Native macOS display capture excludes the entire MistaRecorda control application, including windows opened after recording starts. The separate clean drawing surface is explicitly included when drawing is enabled. The capture glow and zoom target never belong to the source video. Windows uses capture protection. Linux cannot guarantee exclusion of controls from full-display capture.

## Zoom without changing your desktop

- **Hold Z:** follow the cursor while held; releasing ends the zoom.
- **Tap Z:** lock the zoom at the initial cursor position. Tap again to zoom out.
- The default tap threshold is 250 ms. The Zoom settings button changes the shortcut and magnification.
- The outline is a local guide. The original desktop remains at normal scale. Playback and export apply smooth zoom transitions; timing, target and magnification remain editable in the timeline.

Pause, stop and window changes end an active zoom. A bare Z is also delivered to the app being recorded, so choose a modifier shortcut when that app uses Z.

## Drawing studio

Open **Board** and enable the drawing overlay before starting. Choose the same **full display** in both the recorder and Drawing studio.

Move to the far-left edge to reveal a narrow board handle, then **click** it. The framed whiteboard swings into view. **Put board away** swings it back left and retains the drawing. **⌘/Ctrl + Shift + B** toggles it from another app. Hovering alone does not deploy it.

**Draw on screen** opens the transparent drawing editor; **Done drawing** gives the mouse back to the desktop. The editor's tools remain excluded from the recording. The recorded clean surface contains the drawings. The screen scene and whiteboard scene retain separate content.

In the **iPad** tab, generate a pairing QR. Scan it on an iPad on the same private Wi-Fi, approve that device on the computer, then start the screen preview on the iPad. Use a finger or Apple Pencil to draw. The connection uses local WebRTC, with a lower-frame-rate preview fallback. Actual latency depends on the computer, iPad and network.

Use **Drawings** to save and load drawings; **Settings** selects the display and recording output. Physical iPad/Pencil testing is still required for this build.

## Recording scenes and camera

Open **Capture settings → Recording** to view the main shortcuts. **⌘/Ctrl + Shift + W** toggles the face camera; click the shortcut to change it. During ordinary screen/window capture, camera visibility is recorded as source-time cues and is respected by preview, saved projects and export. The camera can first be enabled after recording starts. In drawing capture, the clean drawing surface includes the camera directly.

**Recording scenes → Add scene** saves a name, one screen/window source and camera on/off state. Click its shortcut field to assign a key, or click **Use**. Microphone and system audio remain the current recorder choices. Scenes never start a recording automatically. During native macOS window capture, window scenes can change the source. Switching to a different display requires stopping first. A missing source leaves the existing source and camera untouched.

## Window shortcuts and sounds

Open the gear button for **Capture settings**.

**Window shortcuts:** assign up to six open application windows. Defaults are **⌘/Ctrl + Alt + 1–6**; click a shortcut field and press your preferred combination. Tab moves to the next field; Backspace clears a shortcut. Start a native Mac **window recording**, then use these shortcuts to change the captured window without ending the take. Differently sized windows fit the original video frame. Desktop drawing currently requires full-display capture, so window switching and drawing overlays are separate capture modes.

**Sound effects:** import WAV, MP3, M4A, OGG, FLAC or AAC files up to 25 MB and two minutes. Preview before recording, set volume and assign shortcuts. Triggers add editable audio clips at the recording time; playback and export mix them in. They are not played aloud during capture, avoiding duplicate recording through computer audio. Paused triggers are ignored. Keep the original recording and its `.sounds.json`/`.sound-N.wav` sidecars together until saving a project.

**Recording:** review shortcuts and enable or disable the subtle capture glow. Settings that change a take are locked while recording. Help appears after hovering or focusing a supported control for three seconds.

## ElevenLabs voices and sharing

Voice controls appear **only after recording, in the editor**. Open the waveform **Voice / ElevenLabs** sidebar. Its compact tuning controls stay in place while only the voice list scrolls. Use **My voices**, **Library**, **Favorites**, or **Presets**, and search to narrow the list. The play button auditions a sample without selecting it.

Click **Use** to convert the current recording’s isolated microphone track with that voice and the displayed tuning. The button shows **Applying…** during processing and **Selected** when the changed track is active. Playback and export switch automatically; **Mic audio → Original** restores the original. **Apply tuning** reconverts with adjusted settings. Computer audio and the original microphone remain intact. Record with the microphone enabled; takes without an isolated microphone track explain why conversion is unavailable.

The conversion-model dropdown lists models the ElevenLabs API reports as supporting voice conversion. Per-voice quality labels reflect supplied model metadata; they do not imply every listed model supports speech-to-speech. Missing metadata is shown honestly.

Use a voice row’s actions to make a preset, then export `.mpvoice` and send that file to another MistaRecorda user. Import through **Import preset…** or **File → Import Voice Preset**. Presets contain voice references and settings, never your API key. Each recipient needs their own ElevenLabs key and access to the referenced voice.

**Connect iPad** is available in the recorder, editor toolbar, and Recording menu. Choose **Show pairing QR**, scan with the iPad camera on the same Wi-Fi, approve the device, then start the stream. Pairing codes expire after five minutes and can be renewed.

The implementation uses ElevenLabs' [Voice Changer endpoint](https://elevenlabs.io/docs/api-reference/speech-to-speech/convert) and [voice listing](https://elevenlabs.io/docs/api-reference/voices/search). A real account loaded voices, completed preset export/import, and converted a synthetic spoken microphone sample. The changed track was selected in the editor and exported successfully; the exported audio matched the changed microphone track. PCM 44.1 kHz and MP3 192 kbps depend on the ElevenLabs subscription tier; an explicit output-format denial falls back through MP3 192 to MP3 128.

See [validation and remaining device checks](capture-studio-validation.md) before treating this as a verified release.

## Permissions and local builds

The recorder checks Screen Recording and Accessibility quietly. A missing grant is shown before the countdown with an explicit **Open Settings** action. Camera and microphone permissions are requested when those inputs are used. Merely displaying saved voice settings does not unlock Keychain; voice API actions still use encrypted key storage.

Local builds now use the persistent **MistaRecorda Local Development** certificate in this Mac’s login Keychain. Use `npm run package:local:mac` after building; it refuses a missing certificate or hash-only identity. Keep the installed copy in `/Applications` and reuse the certificate. Switching certificates or installing an ad-hoc development artifact can invalidate previous grants. See [local signing](local-mac-signing.md). Full Disk Access and passwordless sudo do not resolve recording grants. Source refreshes and native helpers check access without repeatedly requesting it.

## Interface conventions

Capture settings uses a fixed category sidebar: Recording, Recording scenes, Window shortcuts and Sound effects. Settings apply through their existing controls; shortcut edits have explicit Save and Cancel buttons. The footer identifies the selected recording source. Drawing, iPad pairing and saved drawings share compact tabs with a fixed recording transport. Voice conversion remains in the editor after recording.

Visual references: [OBS settings](https://obsproject.com/kb/OBS-Studio-Overview) for category navigation and aligned controls; [DaVinci Resolve Fairlight](https://www.blackmagicdesign.com/products/davinciresolve/fairlight) for compact grouping and restrained status colors. Reference images inform layout; they are not shipped as application assets.
