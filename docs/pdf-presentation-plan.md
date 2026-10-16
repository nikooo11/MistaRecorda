# PDF-assisted presentation setup

Implemented October 16, 2026.

## Presenter workflow

1. Open **Points to talk about → PDFs** on Mac or a paired iPad. Import a PDF once; it is saved on the Mac and available to both devices. The private reader has nearby-page thumbnails, page navigation, text search, fit/150%/200% zoom and touch scrolling. Each device remembers its reading position locally.
2. Switch to **Talking points** to read or edit a named set. **Manage sets** offers New, Rename, Duplicate and Delete. Existing notes migrate to “My talking points.” Saved edits and the active set sync. Unsaved edits stay on their device and cannot overwrite a newer save.
3. Choose **Make presentation with AI**. Set the goal, audience, speaking length and pages. Defaults use the first six pages, allow relevant library memes, and leave sounds, scanned-page images and web research off.
4. Review short editable bullets, PDF page citations, evidence excerpts and optional Chart/Image/Link/Meme/Sound attachments. Preview chart values or available asset thumbnails before accepting. Nothing is deployed or played during drafting.
5. Choose **Add to notes**, **Replace notes**, or **Save as new set**. AI recommends an approach, but the user chooses. Add/Replace keep the previous notes for **Undo AI changes**. A version check rejects stale drafts without overwriting notes. New links and note references save together; newly created charts are rolled back if the note transaction fails.
6. Present with the existing reference chips. Charts are private drafts until reviewed in Objects → chart settings. Meme/image references use private positioning and Deploy; links use the existing browser workflow; sound references use the soundboard rules.

PDFs, notes and draft controls are presenter UI, excluded from the clean drawing/recording surface. Environment backups include PDFs; exported videos do not. A deliberate capture of the app window itself can naturally include its visible UI.

## AI and cost controls

The planner uses **GPT-6.1 Sol**, low reasoning, strict structured output, `store: false`, no automatic retries and a two-minute timeout. It makes one request with at most 12 selected pages, 12,000 text characters per page, 6,000 output tokens, 12,000 characters of existing notes and 200 compact catalog entries. It sends names/tags and IDs, not GIF/audio media. Existing object IDs must exist; links must occur in the PDF or the returned search sources. Text-chart numbers must match whole printed numeric values. Labels, units and meaning still require human review.

PDF.js extracts selectable text locally and caches it while the document is open. **Read scanned pages** sends at most three selected page images when text is missing. It does not permanently OCR the PDF or make scanned pages searchable. **Find supporting sources** explicitly permits one web search; returned links are suggestions to inspect, not proof that a PDF claim is true. Media generation is not triggered automatically.

The UI estimates **$0.03–$0.30 for a text draft**, with actual charges dependent on tokens and provider rates; images/search can cost more. This is an estimate, not a dollar spending cap. Limits bound work instead. Identical drafts reuse a session cache of up to ten results; restarting the app clears that cache. Cancel aborts the request and prevents late results from changing the draft; provider work already processed can still incur charges.

Official model/pricing reference checked October 16, 2026: https://developers.openai.com/api/docs/models/gpt-6.1-sol ($2/million input tokens; $10/million output tokens at standard context pricing).

## Storage and portability

Up to ten PDFs, each at most 6 MB and 500 pages; up to 40 note sets. PDFs are stored under managed UUID filenames with restrictive permissions. Companion reads require the existing paired connection and a document ID in the current presenter metadata; arbitrary paths are rejected. Portable imports verify PDF SHA-256 hashes before writing them. The existing 44 MB total environment-bundle limit still applies.

All note sets, previous-note undo snapshots and the compatible active-note projection are persisted. Notes use the existing global revision for conflict protection. PDF page/zoom are local per device, so private reading does not move another presenter's page. Removing a PDF from the presentation keeps already accepted notes. In-progress AI drafts are session-only; save them as notes to retain them across app restarts.

## Meme audio and help

Meme settings offer **No sound**, library selection, local audio upload and **Remove attached sound**. Save keeps the choice across projects. Removing a sound from the library detaches it from all linked memes, preserving visuals and avoiding broken export references. Controls use the existing three-second hover/focus help, with new plain-language explanations for PDF, note-set, AI review and audio actions.
