# Settings tutorial and optional audio setup — October 15, 2026

## User experience

- First launch offers two short guides: **Screen Record** and **Streamer/Presenter**. Skip/Close leaves recording available; Settings tutorial in Capture settings, the recorder's More menu and editor Settings reopens it. Progress is retained per guide. Completed guides can be reviewed from the beginning.
- Show me opens actual Capture settings and highlights live controls with an arrow and a short callout. Recording walks through source selection, camera placement, environments and sound recording. Stream walks through the optional driver, audio routes and start/test controls. Back, Next, End tour and return to Tutorial are available. Reading the tour does not change capture/audio preferences, install a driver, record, or start a stream.
- Small question-mark buttons explain what each setting does, when to use it, and how it fits the workflow. Included beside source selection, camera/layers, environments, sound recording, Stream routing fields, recorder microphone/countdown and editor Export. Help supports keyboard focus, Escape, a close button and outside-click dismissal. Controls remain interactive during a tour.
- Fresh-install defaults remain microphone and computer audio on, 3-second countdown, camera off until enabled, included soundboard audio on, and MP4 / Original / 30 fps / Balanced / Auto export. Existing preferences are retained. Headphone guidance explains why speaker playback can be captured twice.
- On Mac, Capture settings, Recording zoom and Settings tutorial use an integrated dark header with inset native traffic lights. The separate app-name strip is hidden. Header space drags the window; buttons remain clickable and are kept clear of the native controls. Other platforms retain their native frame.

## Optional driver and package

- Screen/microphone/computer-audio recording, soundboard, editing and export do not need BlackHole. Sending a mixed microphone/soundboard signal to another app requires a compatible virtual audio device.
- Sound effects → Stream checks for BlackHole without starting microphone capture. Install BlackHole downloads the unmodified official 0.7.1 installer only on request. It checks a pinned SHA-256, file-size bound and the Apple Developer ID Installer identity before opening macOS Installer. Only the local Capture settings window can initiate this. It refuses installation during recording or Stream mode, does not downgrade an existing driver, and does not change system input/output defaults.
- Opening Installer is not treated as successful installation. Check installation and app focus recheck the installed driver; cancellation or network failure leaves normal recording available. Windows links to the official VB-CABLE site.
- `npm run package:local:mac:installer` wraps the persistently signed local app in an app-only `.pkg` for `/Applications`. No installer scripts or audio drivers are bundled. The local installer container is unsigned; it is for this development Mac, not public distribution.
- Release CI optionally creates a public `.pkg` when `APPLE_INSTALLER_CERTIFICATE_P12_BASE64` and `APPLE_INSTALLER_CERTIFICATE_PASSWORD` are configured, in addition to existing Developer ID Application/notarization secrets. It verifies the installer signature, submits it to Apple, staples/validates the ticket and assesses it before upload. Without the installer certificate, existing DMG/ZIP distribution remains. Public installer CI/notarization has not been executed in this local validation.

## Artwork

- Original scenario illustration: Higgsfield `gpt_image_2_5`, job `5964c6bd-c9ae-433b-9462-78b0954dcfe0`.
- Reference edit: Higgsfield **Nano Banana 2.1** (`nano_banana_2_1`), job `26658930-e1d6-46e0-9a36-d7bc3af6248e`. The two scenes contrast recording a lesson with presenting/streaming using headphones.
- Titles and OBS / Discord / Zoom badges are rendered by the app over the image so they remain readable when cards resize. Brand icons use existing `react-icons/si`; they identify supported receiving apps and do not imply affiliation.

## Validation

- TypeScript and production Vite/Electron build checks pass. Full Vitest suite: **1,270 tests in 160 files**. Driver tests exercise absent/existing installs, concurrency, bad hashes/signatures, oversize downloads, network/open errors and recording/stream blocking. Tutorial window tests cover coalesced first-launch opening, reuse and failed-load recovery.
- Browser playtest used the actual React components with a mock Electron bridge at normal (820×620 / guide 840×700) and minimum (660×560 / guide 620×570) sizes. Both workflow guides, saved progress/review, actual-panel highlights, four recording/three Stream tour steps, Back/Next/Done, contextual popovers, Escape dismissal and routing selectors passed. The bridge log contained no preference mutation, recording, stream-start or install request from reading/completing the tour.
- Driver UI browser tests covered no driver, installed driver, installer opened but not completed, recheck, retry after a download error and disabled installation during an active stream. These were simulated states; the user's existing driver was not removed.
- Installed the final ARM64 app in `/Applications` and verified its signature with `codesign --verify --deep --strict`. It retains the existing local development identity and designated requirement (certificate leaf `649F1C64B98A9881A886A3484C936F2E1691D67B`). The app-only local `.pkg` also builds successfully; its archive contains no installer scripts. The public installer signing/notarization path has not been run locally.
- Native Mac playtest passed: first-launch suggestion, opening/reopening from Capture settings and recorder More, all four actual-control recording steps, all three Stream steps, contextual help open/close and Escape, and Skip returning to the ready recorder. Stream setup detects the existing BlackHole 2ch 0.7.1 installation. The walkthrough leaves Stream stopped and does not alter audio routes or camera settings.
- The integrated Capture header's tutorial button, Zoom header's help button and native close controls work in the installed app. Browser layout checks confirm the 86px traffic-light clearance and clickable header controls at minimum window sizes. Native screenshots are intentionally blank because capture protection remains enabled; native window dragging and final traffic-light appearance were not visually verified by automation. The saved screenshots show the actual React views with a mock bridge, not native macOS chrome.

## Sources used for the guidance

- [BlackHole installation](https://github.com/ExistentialAudio/BlackHole/wiki/Installation) and [Homebrew upstream metadata](https://formulae.brew.sh/api/cask/blackhole-2ch.json).
- [OBS audio sources](https://obsproject.com/kb/audio-sources) and [quick start](https://obsproject.com/kb/quick-start-guide).
- [Zoom audio testing](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0062765).
- [Discord voice/video/streaming guide](https://support.discord.com/hc/en-us/articles/33030151293079-Discord-Voice-Video-Streaming-Guide).

A live receiving-app loopback in OBS/Zoom/Discord, Windows/Intel acceptance and a physical iPad pass are not established by these tutorial tests. Earlier production feature acceptance remains documented separately.
