# PDF-assisted presentation setup

Status: proposed workflow and implementation plan. PDF importing and AI presentation drafting are not implemented by this document.

## A simple presenter workflow

1. Open **Talking points** on Mac or iPad. A compact selector switches between named note sets, with New, Rename, Duplicate and Delete in its menu. Existing notes become a set named “My talking points.”
2. Choose **Import PDF**. It opens a private PDF tab beside **Talking points** and **Objects**. The viewer offers page thumbnails, page number, search, zoom and touch scrolling. A small “Presenter only · not recorded” label makes its purpose clear. Switching tabs preserves PDF page/zoom and the selected note set.
3. Choose **Make presentation**. A single small form asks for the topic/goal, audience, target length and PDF pages. Useful defaults: a short explainer, all reasonable-length pages, existing notes included, subtle visual suggestions, sounds off. Long PDFs default to choosing chapters/pages before analysis.
4. Review the draft. Show an outline of short bullet points, each with its source page and compact attachment chips: **Chart**, **Image**, **Link**, **Meme**, **Sound**. Clicking a chip previews the suggestion. Nothing is deployed or played automatically.
5. Choose **Add to these notes**, **Replace these notes**, or **Save as new set**. Recommend Add when useful existing material should stay; recommend Replace only when the user asked for a rewrite or the existing notes are empty/off-topic. Explain the recommendation in one sentence. The user makes the choice; AI must not silently judge and discard “ineffective” notes.
6. Present from the iPad. A point can read “Explain the trend · Chart attached” or “Pause for reaction · Meme + sound attached.” Its @reference uses the existing private placement, resize, tilt and Deploy controls. Links use the existing new-Chrome-tab/source-switch workflow. The PDF viewer and talking points remain private throughout.

## Draft contents and useful defaults

- Keep points short, editable, and ordered for explaining: context, claim, evidence, explanation, takeaway. Distinguish the PDF author's claims from verified facts. Preserve page citations, units, dates and uncertainty.
- Extract text locally first. Use page images/OCR only for scanned pages and the selected charts/tables; do not send every page as a large image by default.
- Reuse objects already in the presentation. Match meme/sound suggestions against library names, tags, favorites/loves and available settings. Send compact catalog metadata and asset IDs to AI, not entire GIFs or audio files. Generated plans may reference only real IDs.
- Offer a few relevant visual suggestions rather than adding an object to every point. Memes and sounds are optional, restrained and separate from factual evidence. Default sounds off; an attached sound gets its visible audio badge and follows the chosen recording/stream audio mode.
- Charts use the existing editable chart/reveal system. A chart may be created only from explicit numbers, labels and units in the PDF or a checked source. Unreadable data creates a “Review data” suggestion instead of an invented graph. Support a table/pie/line/bar choice appropriate to the data.
- Suggest source links from the PDF first. Optional **Find supporting sources** performs a limited web search and retains the URL/title/date and the claim it supports. Unverified links are marked for review. A link can store an existing supported text/scroll destination.
- Reuse existing images/memes before offering generation. Image generation and new voice/audio generation are separate explicit actions with their own estimates.
- Staged visual objects start as shadow objects, retaining the existing 50% private preview. Library assets are not modified by preparing a presentation; presentation-specific effect overrides are kept with its object reference. **Save to Edited memes** is an explicit library action.

## Saving and Mac/iPad synchronization

Extend `PresenterDocument` with named note sets, active set ID, PDF documents, private viewer positions and draft history. Each note set has its own version and references. Migrate the current `notes` field without losing content; keep a compatible active-set projection while clients are upgraded.

Store PDFs in the Mac's managed presentation assets. Serve only approved document IDs to an authenticated paired iPad; never accept an arbitrary filesystem path from a companion. Cache page thumbnails/rendered pages and request full pages on demand. Preserve each device's reading position unless **Follow presenter** is enabled. Notes and accepted object changes sync through the existing version/conflict mechanism.

Switching note sets prompts to save or retain an unsaved draft. PDF analysis produces a separate draft with an explicit base version. Applying Add/Replace is one atomic save: objects, references and notes commit together. If another device saved meanwhile, keep the AI draft and offer a comparison instead of overwriting it. Save the previous set revision so **Undo AI changes** restores it.

Export/import the complete presentation bundle with note sets, references, objects and optionally its private PDFs. Explain that private PDFs are included only in that presentation bundle, never in the exported video. An imported bundle must resolve its referenced assets before it is applied.

## Cost controls and progress

Analyze selected pages once, cache extraction by document hash, and cache plans by page selection and instructions. Start with one bounded text-planning request; make a second vision request only for specific unreadable pages/charts. Reanalyzing edited notes should reuse the PDF extraction and catalog matches. No continuous AI listening or repeated analysis simply because a tab is opened.

Before analysis show selected page count, whether OCR is needed, and an estimate using the provider/model prices configured at implementation time. Offer **Quick draft** by default and optional deeper source research. Bound output, source searches and OCR pages; stop at the user-visible budget rather than continuing automatically.

Progress stays simple: “Reading PDF,” “Drafting talking points,” “Matching your objects,” “Ready to review.” Completion summarizes the proposed changes, for example: “8 points, 2 charts and 1 meme suggested. Your existing notes are unchanged.” Errors preserve the original notes and imported document, explain whether a key, connection or page needs attention, and offer Retry. Cancel prevents late results from applying.

## Implementation order and playtest

1. Private PDF viewer, named note sets, migration and Mac/iPad synchronization.
2. Local extraction, AI draft review and Add/Replace/New-set application with undo.
3. Referenced chart/link/image suggestions and tagged meme/sound catalog matching.
4. Portable bundle support and optional source research/generation.

Validate with a text PDF, scanned PDF, charts with unclear labels, long PDF, corrupt/password-protected PDF, missing assets, invalid keys and offline mode. On Mac and simulated iPad, switch documents/sets, edit on Mac and read on iPad, preserve unsaved drafts, apply Add/Replace then Undo, stage suggested objects and reload/export/import the presentation. A native recording must show deployed public objects while excluding the PDF, notes, draft review and controls. Physical iPad/Pencil scrolling, dragging and reading legibility need a separate device check.
