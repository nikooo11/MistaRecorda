# iPad talking points and objects

The small **Points to talk about** side button opens a collapsible notes panel. Notes stay on the companion iPad; they are not drawn into the Mac overlay or recording.

## Presenting

1. Open **Objects** to prepare named images, memes, sounds and webpages. Existing standby images, memes and soundboard sounds appear automatically.
2. In **Talking points → Edit points**, use the bullet, bold and link buttons. Type `@` followed by an object name and choose a suggestion, or use **@ Object**. Save to keep the notes on the computer across reconnects and app restarts.
3. In the reading view, tap an image or meme reference to arm a 50%-opacity placement preview, then tap the screen or whiteboard to place it. Images become selected objects with resize handles. Meme placement uses the saved entrance, exit and sound settings.
4. Alternatively, hold a reference for 350 ms, then drag it onto the canvas. Dropping outside the canvas cancels. Tap is also available when holding is inconvenient.
5. Sound references use the existing soundboard mode. Webpage references open Chrome on the computer. Neither is inserted as a visual canvas object.

References store stable object IDs. Renaming an object updates its displayed reference without breaking the notes. Removing the object leaves an explicit unavailable reference. Clear drawings does not clear talking points or the object library.

## Object settings

| Type | Preview / identity | Gear settings | Activation |
| --- | --- | --- | --- |
| Image | Thumbnail and image icon | Name, initial width (5–100% of canvas) | Place an independent image; select to move/resize |
| Meme | Animated/static thumbnail and film icon | Existing meme editor: name, entrance/exit, lifetime/dismissal and optional sound | Existing meme placement and playback rules |
| Sound | Speaker icon, name and duration | Name, volume, button color, favorite | Existing recording/streaming audio rules; headphones prevent speaker bleed |
| Webpage | Browser icon, name and hostname | URL; saved URL position, exact passage, or section anchor | New tab in the computer's existing Chrome session |

PNG, JPEG and WebP images can be imported directly into Objects (12 MB file limit). Animated GIFs belong in Memes. Sound files are imported in Mac Capture settings → Sound effects; metadata changes from the iPad are shared with the Mac soundboard.

## Webpage placement decision

This version uses the user-approved Chrome fallback. Tapping **or dragging** a webpage opens it in Chrome, putting the whiteboard away if necessary while retaining its objects. Use **Capture Mac screen** to save a still and annotate it on the whiteboard.

An embedded browser would have a separate login session. Capturing and remotely controlling a user's regular Chrome tab would require a companion browser extension and explicit per-tab access. Chrome 136 also stopped honoring remote-debugging switches against its default profile. This implementation does not enable debugging, copy browser cookies, install an extension, or create background tabs tied to board object deletion.

For a saved scroll destination, use **Exact text on the page** and paste a distinctive passage, or provide the site's section ID. Chrome's text fragment navigates to the first match. Dynamic pages, changed text, missing anchors and login redirects can prevent the jump; the URL still opens. Pixel scroll offsets are deliberately not saved because viewport and article layout changes make them unreliable.

References:

- [Chrome remote debugging changes](https://developer.chrome.com/blog/remote-debugging-port)
- [Text fragments and matching behavior](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment/Text_fragments)
- [URL fragments and section anchors](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment)

## Data and synchronization

`drawing-board/presenter.json` stores notes, stable references, named links and image preferences separately from recorded scenes. Saves are atomic, serialized and version-checked; a stale device cannot silently overwrite newer notes. An unsaved local draft is retained when another device publishes a change. Only approved paired companions can call the presenter actions. URLs are restricted to HTTP(S), without embedded credentials. Sound metadata edits cannot change local paths or shortcuts.

## Validation — 2026-10-15

- TypeScript passed; scoped Biome lint passed.
- Full suite: 1,241 tests across 155 files passed, followed by an additional passing failed-write/retry regression (1,242 total). New regressions cover persistence, concurrent/stale saves, failed writes, scene isolation, URL validation/encoding, reference renaming, formatting, mention suggestions and LAN-safe IDs.
- Production renderer/main build and Electron main smoke passed. The macOS package was signed with the existing persistent local identity and passed strict signature verification.
- Simulated iPad browser using the real BoardCanvas: created a named link with an exact-text destination; authored and saved bold bullet points with image/link/sound references; dispatched link and sound actions; verified 50% image placement preview; placed and selected the image; renamed it through its gear and verified the existing note updated.
- The simulator isolates its data and stubs OS browser/audio actions. Physical Apple Pencil long-drag, native Chrome tab opening, and live recorded audio remain device checks; the Mac was locked and the user away. Existing Keychain-dependent ElevenLabs and virtual-audio checks from the preceding work also remain pending.
