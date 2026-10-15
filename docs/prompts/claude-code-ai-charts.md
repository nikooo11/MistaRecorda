# Claude Code implementation prompt: AI charts for MistaRecorda

Implement the AI chart feature described below for `/Users/nikostavros/Developer/MistaRecorda`. This document is the requested handoff; the chart feature has not been implemented yet.

## Worktree and ownership

First inspect repository instructions, Git status, branches, and worktrees. Fetch `origin` and create a separate worktree from the latest `origin/main`, using branch `codex/ai-chart-presenter` and a non-conflicting sibling directory. If that branch or path already exists, inspect it before reusing it; never reset or overwrite another task's work.

The compact iPad workspace and saved whiteboard tabs land with this prompt. Integrate the latest `origin/main` into your existing chart branch before final compatibility testing. Do not modify, stash, commit, or clean another checkout's work. If `codex/ai-chart-presenter` is already active, continue there instead of creating a duplicate worktree.

Scope your implementation to AI charts and their required integrations. The other work covers movable/collapsible panels, simultaneous soundboard/meme/notes menus, Pencil input in Pan & Zoom, and saved whiteboard tabs with separate viewed and active boards. Inspect those changes once they land on `main`, integrate them into your branch, and test compatibility before delivery. Charts must belong to the appropriate screen or whiteboard page; preparing an inactive whiteboard must not change the Mac's active output. Do not recreate or replace those features independently. You can build chart schemas, extraction, rendering, and focused tests while the other work is in progress.

## Product goal

MistaRecorda is a simple screen recorder and presenter tool with a paired iPad. Add **AI Chart**: a presenter can capture a chart or statistic from a webpage, turn it into a correctly labeled, editable statistical visualization, and explain it gradually on the whiteboard or over the screen. A private slider lets the presenter reveal the chart forwards or backwards, pause, step, or play it. The audience and recording see the chart, labels, and its reveal—not the slider, editor, extraction preview, or presenter controls.

Keep this easy during a recording. Use a small chart icon and an on-demand, draggable/collapsible panel in the existing iPad side launcher. Do not crowd the canvas or close the soundboard, memes, notes, or other open panels. Match the project theme and reuse the compact panel system. Explain unfamiliar settings with short help text/tooltips and useful defaults.

## Workflow

1. **Capture / import:** user taps AI Chart and chooses Capture Mac screen, an existing standby image, or an uploaded screenshot (PNG/JPEG/WebP). Reuse the current screen capture source, permissions, and image storage. Offer a crop preview so only the chart/statistic region is submitted. Retain the source screenshot, optional source URL, publisher, date, units, and date range for comparison.
2. **Extract:** explicit “Analyze chart” sends the selected image to the user's configured OpenAI API account. Explain that this uploads the image and uses API credits. Reuse secure Mac-side key storage; never put keys in browser/iPad code, project exports, URLs, or logs. No automatic upload just from opening the panel or taking a screenshot. Allow cancellation and useful error messages.
3. **Review:** show original image alongside proposed chart and an editable data table. AI identifies chart type, title, axes, unit, labels, legend/series, dates, values, source, and uncertainty. Clearly mark estimates or unreadable values. Missing/ambiguous values must remain unresolved; do not invent values or silently convert missing data to zero. Presenter confirms/corrects before publication. A single statistic may be a labeled number card; use a bar or pie only when the comparison/denominator supports it.
4. **Place:** add to screen or whiteboard as one selectable, movable, resizable chart object. Keep a source reference and readable labels. User can prepare it as a shadow object (50% on iPad, absent on Mac/recording) then reveal it with existing group/shadow rules. Screen and whiteboard scenes retain separate persistent charts, just as drawings and memes do.
5. **Present:** a small private “Present chart” panel provides reveal slider, play/pause, previous/next step, rewind/reset, speed/duration, and show-all. Default to manual, one category or data point at a time. Show title/axes/context before revealing data. Keep axis ranges stable while playing so the story is not distorted. Slider changes can go backwards at any time. User can draw annotations over the chart while presenting. Do not switch Draw/Pan modes unexpectedly.
6. **Edit:** tapping Edit opens labels, colors, chart type, data table, axis/units, and reveal settings. Permit direct manipulation in explicit Edit mode: drag a line point or bar endpoint to change its value, snap to sensible increments, and update the table immediately. Pie/donut values should be edited with a labeled slice control or table; any direct handle must show the numerical effect. Provide undo/redo, keyboard/numeric alternatives, and reset-to-source-data. Ordinary object resizing must not alter data. After source data is changed, mark the chart “Edited from source” and retain the original extracted values. Preview edits privately and Apply them deliberately during live presentation.

## Chart types and statistical accuracy

Support line, vertical/horizontal bar, pie/donut, and a single-statistic card first. Support multiple series and legends where practical; if unsupported, say so rather than flattening them incorrectly. Prefer line for time series, bar for category comparisons, pie/donut only for a known nonnegative composition of a whole. A screenshot may contain several charts: ask the presenter to crop/select one rather than merging unrelated data.

Use structured, validated data as the source of truth, never an AI-painted bitmap of a chart. Render deterministically from that data. Numbers, text, visual marks, source labels and reveal must agree. Handle negative values, zeroes, missing values/gaps, percentages, decimals, dates, very long labels, and large/small magnitudes. A screenshot's log scale or truncated axis must not be mistaken for a linear zero baseline. Preserve the meaningful scale or disclose the conversion. Default bar charts to zero baseline. Pie totals must be explicit; never silently normalize incompatible counts into misleading percentages. Default to a readable, high-contrast palette with non-color cues. All labels should remain legible at common recording sizes and aspect ratios.

Never claim OCR/vision measurements are exact when they are estimated from geometry. Prefer printed values or a verified source table. Retain provenance and confidence per value or series as appropriate. User must be able to correct labels, units, titles, and values before showing a chart.

## AI mic and research integration

Integrate with the existing AI figures/mic workflow. When the presenter talks about a statistic, the agent can suggest a suitable sourced chart and offer **Create editable chart** in addition to Chrome link / import image. Use primary sources and verify context and date range; search should not merely confirm the speaker's claim. The agent may retrieve an accessible chart image, a published data table, or capture a supported source page through an available authorized browser mechanism. Do not fabricate screenshot capability, bypass a login/paywall, or copy browser credentials. If automated capture is unavailable, open the source in Chrome and guide the user to Capture Mac screen.

AI research and chart extraction should produce a private draft, never auto-publish or play it during recording. Reuse the current agent conventions, request lifecycle, cancellation, source checks, cost limits, and cleanup. Verify current official OpenAI API/SDK docs and available models before adding calls; don't assume names/endpoints in existing code are current. Do not replace the app's working agent architecture unnecessarily. Mocked tests are allowed; clearly report any live API check blocked by missing key/model access. Do not create a new API key or incur unbounded costs.

## Architecture to inspect

These are entry points, not a prescribed implementation. Check current source before relying on exact structure:

- `src/components/board/BoardCanvas.tsx`, `TabletApp.tsx`, `BoardLaser.tsx`, `Memes.tsx`, `shadowObjects.ts`, `sceneSync.ts`, `tabletPanels.ts`, `board.css`: canvas, gestures, clean rendering, live scene sync, overlays, private controls.
- `src/components/board/FigureAssistant.tsx`, `FigureMicrophone.tsx`; `electron/figures/service.ts`, `settings.ts`, `sources.ts`: AI mic/research and Mac-side key handling.
- `src/types/board.ts`, `presenter.ts`, `figures.ts`; `electron/board/register.ts`, presenter store, scene validation/persistence, companion transport: shared schemas and request boundary.
- `TalkingPoints.tsx`, `PresenterObjects.tsx`, `presenterModel.ts`, `EnvironmentFiles.tsx`, environment import/export and board MCP server: named objects, @references, shadow groups, portable scene setups and agent access.
- Screen/window recording, board compositing, editor and export paths: find all paths that must show chart reveal consistently, including recording a single app window with whiteboard open.

Choose a versioned chart schema containing stable IDs, chart kind, source/provenance, original and edited data, series/labels/units/axis configuration, layout/style, and reveal configuration. Separate durable chart data from transient playback state. Reuse validated event transport and persistence rather than streaming full images or full scenes for every slider tick. Bound points/series/payload size. Resolve concurrent edits and stale responses deterministically. Save/import/export chart data, original screenshots and references with existing presentation environments. Old projects must still load. Charts must work offline after extraction and remain editable without an API key.

Use a deterministic logical playback clock or timestamped reveal events. Keep iPad, Mac overlay, recording, replay/export and pause/resume aligned, including scrub backwards and reconnect. Do not rely on unrecorded CSS wall-clock animation. If the recorder currently bakes the overlay into video, verify that result instead of promising post-recording editable chart animation that has not been implemented. Avoid blocking ink input, introducing the old clear/zoom offset bugs, or leaking private controls into clean renders. Provide a shared renderer or equivalent tested parity between live and export.

Add a `chart` object type to objects/talking points with a distinctive chart icon, thumbnail, name and gear settings. @references should resolve stable IDs. Drag or tap-to-place should obey existing placement and shadow rules. Group reveal should reveal all grouped shadow members. Chart settings should include name, type, labels/units, data, colors, source display, reveal order/speed, and shadow status. Default to no entrance animation and manual reveal. Keep presenter controls off recorded surfaces.

Expose validated chart create/update/read/present operations through the existing local authenticated MCP interface so Codex/Claude can prepare scenes from a source screenshot or known data. Return reviewable drafts; require deliberate publish/reveal. Do not weaken authentication or open new public ports.

## Verification and delivery

Implement the full end-to-end feature, not disconnected UI or placeholders. Add meaningful tests for extraction/schema validation, missing/ambiguous data, unit/scale handling, negative/zero/missing values, pie totals, point drag↔table consistency, undo/redo, deterministic reveal, backward scrubbing, pause/resume, stale events, clean render exclusion, shadows/group reveal, and environment round-trip. Test old environment compatibility and payload/URL validation. Test cancellation, invalid key, unavailable model, and unsafe/untrusted source content.

Playtest a short whiteboard explanation: import a known line chart screenshot, inspect/correct labels, place, reveal slowly, pause and scrub backwards, edit a point, annotate, switch screen/board, reconnect iPad, then record and export. Repeat with bar and pie data. Confirm with decoded video frames that private sliders/menus never appear and chart/ink placement is aligned. Test a window-only recording with the whiteboard visible. Use a fake iPad/browser fixture if physical iPad automation is unavailable; explicitly distinguish that from physical Pencil verification.

Take screenshots at iPad landscape and portrait sizes. Ensure the chart panel can coexist with soundboard, memes and talking notes, minimizes to the side launcher, stays within bounds after rotation, and doesn't steal Pencil input in Pan & Zoom. Run repository typecheck and relevant tests/build checks. Do not stop an active recording or replace a running installed app without first checking whether it's safe.

Start by summarizing the architecture and implementation plan, then implement and test. Ask only if a material product decision cannot be resolved from this prompt or repository. Deliver a concise walkthrough, screenshots, changed files, tests/results and honest remaining limitations. Keep scope to AI charts and required integrations; don't undo the newly compact iPad workspace. Do not automatically merge/push or install a build unless I authorize that in this Claude session.
