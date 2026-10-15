# Starter soundboard pack

Seven effects cut from the user-provided MP3, in the order labeled in the
[reference video](https://www.youtube.com/watch?v=LL2m6ak3auc). The user reviewed
the individual previews and approved them for implementation.

| Sound | Length | Source interval (seconds) |
| --- | ---: | ---: |
| Fahhhhh | 1.860 s | 0.250–2.110 |
| Core | 0.710 s | 2.110–2.820 |
| Shocked | 1.210 s | 2.850–4.060 |
| Bass Drop | 2.940 s | 4.200–7.140 |
| Boom Timer | 1.625 s | 7.140–8.765 |
| Bow and Arrow | 1.275 s | 8.765–10.040 |
| Gear | 1.960 s | 10.080–12.040 |

Assets live in `public/sounds/starter-v1/`. They are stereo 48 kHz, 16-bit PCM
WAVs with 3 ms edge fades. Original levels are retained. Internal gaps within
multi-part effects are retained. The manifest records the source filename,
source URL, original SHA-256, cut intervals and individual file checksums.

To reproduce the clips from that exact original file:

```sh
node scripts/build-starter-sounds.mjs /path/to/original.mp3
```

On first launch or upgrade, missing defaults are copied into the normal studio
sound storage and saved with stable IDs. User sounds and settings are preserved.
Installed IDs are remembered independently of the visible list, so deleting a
default does not cause it to return on restart. **Restore default sounds** adds
back removed defaults without resetting retained sounds. No hotkeys are assigned
automatically. The Mac and iPad share the same library and playback routes,
including Stream mode and editable recording sound clips.

Validation (2026-10-15):

- TypeScript passed; full suite passed: 1,278 tests in 161 files.
- Seven WAVs verified for checksums, PCM format, sample rate, channel count,
  duration, non-silent audio and faded endpoints.
- Fresh-install and upgrade seeding, deletion persistence, explicit restore,
  capacity limits, incomplete installations and file collision protection passed.
- Studio integration verified saved defaults, Mac/iPad preview data, restart,
  restore blocking during recording, unreadable-settings preservation and
  recovery from conflicting saved shortcuts.
- Production renderer/main build and Electron main-process smoke check passed.

## Default meme library

The 25 user-provided Downloads GIFs are bundled in source under
`public/assets/memes/starter-v1/` and included in the app and installer. No PNG
files were present in the requested Downloads batch. Originals are untouched.
19 source GIFs animate; six (including Fahhh) contain only one frame. The app
preserves that distinction instead of inventing animation.

Large GIFs are reduced where doing so saves space. The pack totals 53.37 MiB.
Each manifest entry records the original and bundled checksums and dimensions.
The reproducible import script is `scripts/build-starter-memes.mjs`; descriptions
and use-case tags are maintained in `scripts/starter-meme-metadata.json`.

The Fahhh preset has the Fahhhhh sound attached. All other memes are silent.
Gear → Sound on placement → No sound detaches audio. The small speaker badge
marks attached audio. A larger, silent hover/focus preview explicitly says
**Contains audio**, with the sound name when available, or **No audio**.

Every default has 8–13 searchable use-case tags and a short editable AI hint.
For example, “stupid” finds Seriously, Jonah Hill Annoyed, Cut It Out and other
reactions. Gear settings allow changing tags and hints. Search works in Memes
and the Objects menu.

- Love is a personal, persistent preference; loved memes sort first, including
  after restarting or importing another presentation.
- Favorite is a take/presentation preference. Picks made during preparation carry
  into the take, remain during pause, and reset when recording stops. Saved
  presentation environments retain their own favorite IDs.
- Removed defaults stay removed after restarting. Restore default memes adds
  only missing entries and keeps custom names, tags, transitions, sounds and loves.

Bundled GIFs use strictly allowlisted, versioned asset references instead of
embedding megabytes in every drawing-state update. The iPad serves/caches the
same assets through the existing companion server. This keeps the full default
library's state below 40 KB. Presentation exports reference these app-bundled
assets; uploaded images/GIFs continue to be embedded in presentation files.

## AI mic suggestions

The existing OpenAI Agents API research flow receives the current library's IDs,
names, tags, descriptions, audio presence and Love preference alongside the topic
or mic transcript. It does not upload GIF files. It can return up to three sourced
visual/link suggestions plus two fitting memes. A returned meme must match a
current library ID; unknown/deleted IDs and duplicates are discarded. Names and
hints are explicitly treated as data, not instructions. Satirical memes are
reactions, not factual evidence.

Meme suggestions show a preview and audio indicator. Tapping arms the existing
50% placement preview; nothing is placed or sounded until the presenter chooses
where to place it. The current saved audio/transition settings are used.

The user supplies their own OpenAI key in the app. No key was available during
this update, so remote API search quality was not live-tested. Mocked integration
checks cover microphone transcription → tagged library search → validated meme
results, metadata-only upload, cancellation and hosted-session cleanup. See the
[Agents API documentation](https://developers.openai.com/api/docs/guides/agents-api/overview).

## Combined validation

- TypeScript and all **1,287 tests in 162 files** passed.
- All 25 GIFs decoded successfully; checksums/dimensions and the 19 animated /
  6 still distinction were verified.
- Tests cover seeding, deletion/restore, disk reload, retained audio removal,
  Love/Favorite ordering and lifecycle, presentation round trips, tag matching,
  allowlisted asset references, and authenticated iPad preference actions.
- Browser playtests of the real UI components verified tag search, Love/Favorite,
  favorite reset, gear audio removal, tag edits, Contains audio preview, and AI
  suggestion selection without automatic placement/audio.
- The headphones caution in Capture settings appears only when **Include
  soundboard in recording** is off; toggling on hides it. Both states were
  playtested. The hover help still explains acoustic microphone leakage.
- The signed arm64 app was installed and launched. Native UI checks confirmed
  all seven sounds, the off/on headphones caution, all 25 memes and Fahhh's
  attached sound in its gear settings. Every installed WAV and every GIF served
  by the packaged app matched its manifest checksum. Existing studio preferences
  and drawing content were retained; temporary overlay settings were restored.
- The signed-app local installer was rebuilt at
  `release/MistaRecorda-local-arm64.pkg`. Its installer container is local-only
  (not signed/notarized for public distribution).
