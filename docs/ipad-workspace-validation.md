# Compact iPad workspace

The Mac preview remains fitted to the full available workspace. Colors use the left margin and a 48px menu strip uses the right margin. No new reserved column reduces the preview size. On narrow viewports controls may overlap the preview, so panels can be moved or minimized.

- Sounds, Memes, AI figures, Notes, Images and object controls have independent side launchers. Open panels coexist. Minimize returns a panel to its launcher without discarding its content.
- Panel handles drag with touch, Pencil or mouse; arrow keys also move them. Panels are clamped on resize/rotation. Drawing tools, styles, actions and the drawing library can collapse too. Positions are local to the iPad/browser, never part of the recording. Actions → Reset panels restores the compact layout without touching drawings.
- Soundboard removes duplicate headers/instructions on iPad. Sounds/Voices, search, compact buttons, and playback status remain. The headphones message appears only when soundboard audio is excluded from the recording mix.
- Pan & Zoom explicitly selects navigation and intercepts Pencil canvas gestures before Excalidraw can create ink. The previous drawing tool returns when Draw is enabled. Menu events do not bubble into the canvas.

## Verification, October 15, 2026

- TypeScript check passed.
- 165 test files, 1,304 tests passed (includes panel boundaries, scene selection, sound preview completion and manual zoom defaults).
- Browser fixture uses the real BoardCanvas, menus and Excalidraw with a sample Mac image and mocked transport. At 1194×700 the fitted 1512×982 Mac image occupies 1013×658; colors and launcher fit in the margins.
- Synthetic Pencil positive control produced a visible stroke and three scene writes in Draw. The same gesture in Pan & Zoom panned by 70×50 pixels with no additional scene writes. Sound playback also left drawing disabled and did not add scene writes. Synthetic events stub only pointer capture in the fixture; this is not physical Apple Pencil verification.
- Browser mouse drag moved the soundboard from (884,96) to (344,121). Collapse/expand and keyboard movement also exercised. Multiple menus tested concurrently.
- Physical iPad touch/Pencil behavior still needs a user check after refreshing the companion page.

AI charts are intentionally not implemented. The separate Claude Code handoff is `docs/prompts/claude-code-ai-charts.md`.

## Saved whiteboards and connection defaults

- Whiteboards can be added, renamed, privately selected, and activated with red/green circles. Only the active board is sent to the Mac. Drawings, text and locally imported images can be prepared on an inactive tab. Meme/AI placement currently requires activating that tab; the UI explains this instead of changing a different live board.
- Screen ink, board-page drawings and placed memes survive switching. Clear targets only the chosen board. Persistence and environment bundle round-trips include inactive tabs and their image assets.
- Browser playtest created two boards, drew on each independently, activated the second, cleared only the first, and checked that undo did not restore another page's ink. Clear retained the selected red stroke color.
- New connections and reconnections default to Pan & Zoom and request the Mac preview automatically. Muted inline playback is attempted automatically; Safari may still require a tap. A mocked WebSocket playtest of the real TabletApp observed one preview request on initial approval, and a second after reconnecting from Draw mode, with Pan & Zoom restored.

## Mac scenes and zoom

- Layers and Environments now show a compact scene list next to the selected source snapshot and camera/audio inputs. Clicking a scene applies it; source selection and camera layout panels collapse. Source snapshots refresh every three seconds and are labeled as snapshots, not final composition previews.
- Browser playtest at 820×620 and 1000×760 switched between two window environments while simulated recording was active. Source, camera, microphone and computer audio display updated together; display switching remained disabled during a window take.
- Automatic click-to-zoom defaults to off and is configurable in Capture settings → Recording and editor Settings. The user's saved preference was explicitly switched off. Existing project edits and the Z shortcut are unaffected.
- Mac sound preview notices clear when playback finishes. Regression coverage verifies overlapping sound completions cannot clear a newer notice and playback errors remain visible. Presenter notices clear on tab changes; iPad sound notices expire after the sound duration.
- Installed the signed arm64 build in `/Applications/MistaRecorda.app` and verified its code signature. Native Capture settings shows the new scene/input controls, microphone and computer audio on, and Automatic click-to-zoom unchecked. Played Bass Drop in the installed soundboard, then opened Environments after playback; the playing notice was gone.

UI fixture screenshots are stored in `.tmp/scenes-workspace-qa.png`, `.tmp/ipad-portrait-qa.png`, `.tmp/ipad-whiteboards-qa.png`, and `.tmp/ipad-auto-start-qa.png` on the development Mac. The fixtures use real components and mocked transport; physical iPad and live-network behavior are not inferred from those tests.
