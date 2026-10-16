# iPad talking points and objects

The small **Points to talk about** side button opens a collapsible notes panel. Notes stay on the companion iPad; they are not drawn into the Mac overlay or recording.

## Presenting

1. Open **Objects** to prepare named images, memes, sounds and webpages. Existing standby images, memes and soundboard sounds appear automatically.
2. In **Talking points → Edit points**, use the bullet, bold and link buttons. Type `@` followed by an object name and choose a suggestion, or use **@ Object**. Save to keep the notes on the computer across reconnects and app restarts.
3. In the reading view, tap an image or meme reference to arm a 50%-opacity placement preview, then tap the screen or whiteboard to place it. Images become selected objects with resize handles. Meme placement uses the saved entrance, exit and sound settings.
4. Alternatively, hold a reference for 350 ms, then drag it onto the canvas. Dropping outside the canvas cancels. Tap is also available when holding is inconvenient.
5. Sound references use the existing soundboard mode. Webpage references open Chrome on the computer. Shadow link/sound references instead place private cue cards; **Show on screen** opens the link or plays the sound while the cue card stays private.

References store stable object IDs. Renaming an object updates its displayed reference without breaking the notes. Removing the object leaves an explicit unavailable reference. Clear drawings does not clear talking points or the object library.

## Object settings

| Type | Preview / identity | Gear settings | Activation |
| --- | --- | --- | --- |
| Image | Thumbnail and image icon | Name, initial width (5–100% of canvas), shadow, entrance | Place an independent image; select to move/resize |
| Meme | Animated/static thumbnail and film icon | Existing meme editor: name, entrance/exit, lifetime/dismissal and optional sound, shadow | Existing meme placement and playback rules |
| Sound | Speaker icon, name and duration | Name, volume, button color, favorite, shadow cue | Existing recording/streaming audio rules; headphones prevent speaker bleed |
| Webpage | Browser icon, name and hostname | URL; saved URL position, exact passage, or section anchor, shadow cue | New tab in the computer's existing Chrome session |

| Note | Note icon and text excerpt | Name, text, shadow (on by default), entrance | Place a private, editable text object |

PNG, JPEG and WebP images can be imported directly into Objects (12 MB file limit). Animated GIFs belong in Memes. Sound files are imported in Mac Capture settings → Sound effects; metadata changes from the iPad are shared with the Mac soundboard.

## Shadow objects

A shadow object is always displayed at **50% opacity on the iPad** and excluded from the Mac overlay, clean screenshot and recording. Prepare a layout privately, then reveal each item when ready.

- Select any drawing, text or image on the iPad, open its small gear, and enable **Shadow object**. Choose no entrance, fade, spin or fall. **Show on screen** reveals the selection at its saved position and starts the entrance. Bound labels and children of private frames remain private with their parent. Showing or hiding any member of a group changes the whole group, including nested groups and bound labels. Reveals start together and retain each object’s saved entrance. Ungroup first to change one member independently. Selecting multiple objects without grouping them does not permanently link their visibility.
- New text created with the iPad Text tool defaults to a private note. **Done** saves it on the iPad; uncheck Shadow before Done to publish it immediately. Select an existing note to move or resize it; double-tap to edit its text.
- **Objects → + Note** creates a reusable named note, available to `@` references. Its shadow default can be changed in its gear settings.
- Image, meme, sound and webpage objects have shadow defaults in their gear. Defaults affect subsequent placements. A placed meme has its own visibility gear; tap a private meme to reveal its small **Show on screen** menu. Private memes neither expire nor play sound. Their entrance, duration and optional audio start on reveal.
- Private sound and link cue cards activate their action when shown and remain hidden from the audience. They can be activated again. They do not become visual webpages or audio-player controls in the recording.
- Screen and whiteboard retain separate objects. Switching between them keeps both layouts; Clear removes objects from the current canvas. Desktop edits preserve private objects even though the Mac editor does not display them.

## Portable environments

Open **Points to talk about → Environments** on the iPad, or **Drawing studio → Settings → Presentation environments** on the Mac.

**Save environment** stores a named setup on the computer. **Download file** creates a self-contained `.mistapresentation.json` file. **Import file** or a saved **Load** button restores both canvases, drawings, independent objects, shadows, reusable notes, talking points, links, images/GIFs, library and soundboard audio/settings. Image and audio bytes travel inside the file, so a separate media folder is unnecessary. The complete file must be under 44 MB; each sound is WAV under 25 MB. Keys, machine paths and global hotkeys are excluded.

Loading requires recording to be stopped and an explicit confirmation. The existing setup is saved as **Before last import** before replacement. Validation happens before replacement. Saved layouts fit uniformly on another display; geometry remains editable. Sound references are remapped if their IDs conflict with local sounds, preserving both versions. Imported sounds do not play automatically. A download contains private notes as well as public material, so share it only with intended collaborators.

## Agent preparation through MCP

In Drawing studio Settings, enable **MCP drawing tools** and use the displayed loopback URL and bearer-token configuration in your MCP-capable client (Codex, Claude Code or another agent). Keep the token in the client's secret/environment setting. Existing paired-iPad authorization is separate. This feature does not automatically enable the server or modify a client's configuration.

The server includes its own guide and tool schemas:

1. Read `board_get` for both canvases, dimensions, IDs, current revision and presenter document.
2. Use `board_draw` with `mode: "screen"` or `"board"`. Text with `note: true` defaults private; any element accepts `shadow: true` and `enter: "none" | "fade" | "spin" | "fall"`.
3. For an authorized reference screenshot, use `board_image` with an image data URL and `shadow: true`, then create editable labels, images and shapes around it. A flattened screenshot remains an image; the agent's vision capability must reconstruct individual objects if requested. MistaRecorda does not itself OCR or automatically reconstruct arbitrary screenshots.
4. `presenter_note`, `presenter_link`, `presenter_preference` and `presenter_notes` prepare reusable objects and bullet points. Note references use `@{token}` with a stable `{kind,id}` mapping; notes saves require `presenter.notesVersion`.
5. `presentation_save`, `presentation_list`, `presentation_load` and `presentation_import` manage complete environments. Loads/imports require `confirmed: true` and user authorization to replace the setup.
6. Use `board_shadow` with selected IDs, mode and current revision to reveal only when requested. `board_screenshot` shows clean output and deliberately omits shadow objects; inspect private geometry through `board_get` and the iPad view.

An agent can prepare both environments without changing the active output. Link activation uses the Chrome behavior below.

## Webpage placement decision

This version uses the user-approved Chrome fallback. Tapping **or dragging** a webpage opens it in Chrome, putting the whiteboard away if necessary while retaining its objects. Use **Capture Mac screen** to save a still and annotate it on the whiteboard.

An embedded browser would have a separate login session. Capturing and remotely controlling a user's regular Chrome tab would require a companion browser extension and explicit per-tab access. Chrome 136 also stopped honoring remote-debugging switches against its default profile. This implementation does not enable debugging, copy browser cookies, install an extension, or create background tabs tied to board object deletion.

For a saved scroll destination, use **Exact text on the page** and paste a distinctive passage, or provide the site's section ID. Chrome's text fragment navigates to the first match. Dynamic pages, changed text, missing anchors and login redirects can prevent the jump; the URL still opens. Pixel scroll offsets are deliberately not saved because viewport and article layout changes make them unreliable.

References:

- [Chrome remote debugging changes](https://developer.chrome.com/blog/remote-debugging-port)
- [Text fragments and matching behavior](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment/Text_fragments)
- [URL fragments and section anchors](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment)

## Data and synchronization

`drawing-board/presenter.json` stores notes, stable references, named links, reusable notes and object preferences separately from recorded scenes. Saves are atomic, serialized and version-checked; a stale device cannot silently overwrite newer notes. An unsaved local draft is retained when another device publishes a change. Only approved paired companions can call the presenter actions. URLs are restricted to HTTP(S), without embedded credentials. Sound metadata edits cannot change local paths or shortcuts.

## Validation — 2026-10-15

- TypeScript passed; scoped Biome lint passed.
- Full suite: 1,241 tests across 155 files passed, followed by an additional passing failed-write/retry regression (1,242 total). New regressions cover persistence, concurrent/stale saves, failed writes, scene isolation, URL validation/encoding, reference renaming, formatting, mention suggestions and LAN-safe IDs.
- Production renderer/main build and Electron main smoke passed. The macOS package was signed with the existing persistent local identity and passed strict signature verification.
- Simulated iPad browser using the real BoardCanvas: created a named link with an exact-text destination; authored and saved bold bullet points with image/link/sound references; dispatched link and sound actions; verified 50% image placement preview; placed and selected the image; renamed it through its gear and verified the existing note updated.
- The simulator isolates its data and stubs OS browser/audio actions. Physical Apple Pencil long-drag, native Chrome tab opening, and live recorded audio remain device checks; the Mac was locked and the user away. Existing Keychain-dependent ElevenLabs and virtual-audio checks from the preceding work also remain pending.

## Shadow-object validation — 2026-10-15

- Installed the final macOS package with the existing persistent signing identity. Strict signature verification passed and installed/source `app.asar` SHA-256 hashes matched. The app was closed during installation.
- Full suite: 1,253 tests across 157 files passed. TypeScript, scoped Biome lint, production build and Electron main smoke passed.
- Automated checks cover private/public projections, parent/label privacy, opacity restoration, reveal timing, desktop edit preservation, shadow meme audio suppression/lifetime, portable media and references, malformed imports, display fitting, and authenticated MCP tools.
- Simulated iPad using the real BoardCanvas: typed a note (shadow on by default), selected it and inspected the gear, verified private text and a private meme absent from clean output, revealed notes and memes, placed a private image, then saved/cleared/loaded its environment with privacy intact. The clipped gear popup was fixed during this test.
- The simulator uses isolated transport data; OS sound/browser actions and physical iPad touch/Apple Pencil remain device checks. Earlier Keychain-dependent voice and streaming audio checks remain pending while the user is away.

## Grouped-shadow follow-up — 2026-10-15

- Revealing or hiding one member expands to its whole group, including nested groups and bound labels. All members use the same reveal timestamp and retain their saved entrance effects. Deleted members cannot connect unrelated groups; duplicates and ungrouped objects remain independent.
- Editing a note retains its group, bindings, rotation and opacity. Changing Shadow in the text draft uses the same group command as the object settings. The private draft takes over focus from the drawing engine's inline editor before typing.
- TypeScript, scoped Biome lint and 17 targeted tests passed. Simulated iPad playtest edited two grouped notes, revealed both by changing one note, hid both through the other note, then revealed the group through a single selected member's Show on screen button. Clean output displayed the two updated notes while an unrelated private note remained hidden.
- Production build and Electron main smoke passed. Installed the signed package while the app was closed; strict signature verification passed and installed/package `app.asar` hashes matched. No physical iPad check was performed for this follow-up.

## Shared Mac/iPad editing follow-up — 2026-10-16

- Recording studio → Notes opens the Mac talking-points editor. The same component is available on the Mac drawing surface and iPad.
- Saved notes, object preferences and imported environments now publish `presenterChanged` to desktop windows as well as connected companions. Notes remain separate from recorded scenes.
- Save points synchronizes both directions. A newer remote save preserves an unsaved local draft; Use saved version explicitly replaces that draft with the latest saved version.
- Browser playtest using two real TalkingPoints instances verified Mac-to-iPad and iPad-to-Mac updates, bold bullets and versioned saves. Backend persistence/concurrent-save regressions passed. Screenshots are retained locally in `.tmp/notes-sync-verified.png` and `.tmp/private-placement-verified.png`.
- Installed Mac smoke test confirmed the studio's Notes button opens the talking-points editor. Existing notes were not modified. Facecam remained off.

## OpenAI test setup — 2026-10-16

- Setup offers Import env file. A native Mac file picker passes the chosen file to the main process, validates OPENAI_API_KEY and saves it using the existing encrypted storage. The plaintext key is never returned to a renderer, companion or project. Companion requests cannot invoke key import.
- Env import accepts standard quoted/export syntax, bounds file size, performs no shell evaluation and uses fixed errors that do not echo file contents. Regression tests cover valid import and rejected values.
- The authorized seven-day test key was written to the confirmed Git-ignored `.env.local`. An authenticated model lookup and a minimal synthetic generation succeeded. After installing the signed update, the native Setup file picker imported that file into encrypted app storage (mode 0600), and Test connection displayed **Connection verified**. The key is not embedded in source or packaged assets.
- Native playtesting caught an actor mismatch: trusted IPC requests use `desktop:<window ID>`, but import previously accepted only `desktop`. Import now accepts the main-process desktop actor formats and rejects companion/agent actors before opening a picker. The regression verifies both valid desktop forms, denied callers and cancellation without saving.
- Final automated checks: TypeScript, repository lint, all 1,425 tests in 184 files, production build and Electron startup smoke passed. The Linux camera-origin test runs with recording inactive; production camera behavior is unchanged. GitHub quality checks passed for the preceding camera/lint fixes.
