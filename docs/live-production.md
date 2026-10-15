# Live recording controls

## Windows and the whiteboard

Assign a window shortcut in **Capture settings → Layers**. During a native Mac window recording, recalling that window switches the recording source and then brings that exact window forward. The app matches the native window identity, not just the application name. If macOS refuses focus, recording continues and the source status explains the problem. Accessibility permission is required to raise windows.

The selected recording window has a short outline flash followed by a subtle glow. The outline, presenter controls and drawing tools are excluded from the recorded picture.

Opening the whiteboard during a single-window recording composites the clean whiteboard over that window. Putting it away returns to the window and its screen annotations. The screen and whiteboard each keep their own drawings and memes until cleared. Escape puts the board away; on the screen it clears screen annotations. **Clear whiteboard** clears only the board. The renderer and capture window must be ready before a newly opened board is attached to an active recording.

## Sounds

Open **Capture settings → Soundboard** on the Mac or **Soundboard** on the iPad. Import sounds on the Mac, search the list, rename sounds, choose button colors and set shortcuts. Favorites rise to the top. The paired iPad uses the same library.

**Include soundboard in recording** is enabled by default. Sounds play for monitoring and become part of the recorded audio exactly once. Turning it off before a take keeps sounds as separate editor clips that can be moved or removed. In native Mac capture, monitor playback is excluded from the captured system audio; the selected mode either mixes the timed sounds into the take or retains editable clips. The original microphone track stays separate for later voice conversion.

Use headphones in either mode. Speaker playback can enter the physical microphone, causing echo or a second copy of the sound. This note also appears beside the setting and in its hover explanation. Sound triggers are unavailable while paused. If final audio mixing fails, the original take and editable sound clips are retained.

## Recorded narration voices

Before recording, open **Soundboard → Voices → Refresh voices** to load the ElevenLabs voices available to your account. Favorites appear first. The cached picker does not unlock Keychain or contact ElevenLabs during a take.

Select a voice on the Mac or iPad to mark the narration from that moment until the next selection. **Original voice** ends the changed-voice interval. The app always records the normal microphone; selecting a voice does not process or upload it.

After recording, colored narration regions show the choices. In **Voice → Narration voices**, jump to a region, adjust its start time, choose among the take's voices or Original, and remove a boundary. **Process voice via ElevenLabs** converts each assigned interval with its saved voice and tuning, retains original intervals, then reassembles the narration at its original timing. Edits invalidate previous processing so stale changed narration cannot silently export. The source microphone is preserved.

## Stream mode

**Soundboard → Stream** mixes a microphone (or an external live voice changer's virtual microphone) with soundboard audio and sends it to a dedicated virtual audio output. In OBS, Zoom, Discord or another receiving app, select that virtual device as the microphone. Sound preview can go separately to headphones. Starting recording stops Stream mode; Stream mode never starts automatically on launch.

Routing requires an installed virtual audio driver. The app links to [BlackHole](https://existential.audio/blackhole/) for Mac and [VB-CABLE](https://vb-audio.com/Cable/) for Windows. It does not install drivers or change the system audio configuration automatically. Choose distinct input, virtual output and headphone routes to avoid feedback.

ElevenLabs' [streaming speech-to-speech endpoint](https://elevenlabs.io/docs/api-reference/speech-to-speech/stream) still takes an uploaded audio file; streaming the response does not provide continuous live microphone conversion. ElevenLabs therefore remains the recording workflow. [Voicemod for Mac](https://www.voicemod.net/en/voice-changer-for-mac/) provides a live virtual microphone and a free version, with paid options priced in its app. Select that microphone in Stream mode and change live voices in Voicemod. Its [public Control API](https://www.voicemod.net/en/developers/) is Windows-only, so Mac/iPad voice buttons do not control Voicemod. These service details were checked against official documentation on October 15, 2026.

## Memes

Open **Memes**, import an image or GIF, then use the small gear beside its preview to set its name, entrance, exit, persistence and optional sound. Transitions default to None; Fade, Spin and Fall are available. An attached sound follows the soundboard recording setting.

Selecting a meme shows a 50% placement preview that follows the pointer or Pencil. Tap/click to deploy it at full opacity. The placement preview and settings are excluded from recording. With drawing controls active, tap a deployed meme to dismiss it, or clear the current surface. Persistent memes remain on their own screen/board surface when switching between them. Timed memes expire after their configured duration.

Libraries support up to 60 assets, with a 12 MB file limit and approximately 36 MB combined decoded-file budget. Animation remains in GIF assets; the import path validates GIF structure without converting it to a still image.

## Validation status

See [the October 15 playtest record](live-production-validation.md) for completed checks and physical-device checks still outstanding. Mac native capture is the tested path; the new Windows streaming route has not received a device acceptance test.
