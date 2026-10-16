# iPad private reference reader — work in progress

The user wants the PDF to remain viewable on iPad with tabs for PDFs and talking points. The reference panel should be movable/minimizable, or expand to fill the iPad for easy reading while presenting. It must stay private and never change the recorded Mac canvas. Keep the user's facecam OFF. Do not interrupt a recording.

Base: main ee16ba83d713d5848accefa2830c3c71a25d61c3. That version is installed on the user's Mac, signed, pushed, and passed 1,435 tests and GitHub CI. It already has synced private PDFs, named talking-point sets, PDF page/zoom/search/thumbnails, and AI presentation drafts. See docs/pdf-presentation-plan.md and docs/pdf-presentation-validation.md.

This branch contains an INCOMPLETE first edit in src/components/board/tabletPanels.ts. It adds an expand control only for the Points to talk about panel and uses the existing non-unmounting collapse/restore mechanism. Do not merge as-is; finish and playtest it.

Remaining work:

- Add tablet-panel-fullscreen CSS in board.css, overriding the floating panel's width/max-width/max-height limits. The hook sets explicit dimensions from the board stage bounds. Keep header controls and PDF/Talking points tabs visible; touch-friendly, compact, no overlap. Expanded mode should provide a comfortable reading area and preserve a way back to the movable panel. Minimize via side Notes button; preserve PDF selection, page, zoom, draft, and unsaved notes.
- Fix TalkingPoints.tsx's dynamically rewritten className (`talking-panel pdf-open`): React tab changes can overwrite the classes added imperatively by useTabletPanels. Use a stable className with a data-pdf-open attribute and adjust presenter.css's `.talking-panel.pdf-open` selector.
- Add a ResizeObserver to PrivatePDFPanel's viewer container and rerender PDF at its current width when expanding/restoring, showing a previously hidden tab, or rotating the iPad. Current render dependencies only include pdf/page/zoom/selected. Ignore zero width while hidden and cancel prior pdf.js renders. Preserve reading position.
- Review the new generic toggle help text in tabletPanels.ts: it currently mentions Notes for ALL panels and must be restricted to the private reference panel or generalized appropriately. Add clear 3-second hover help to new controls using existing data-help mechanism.
- Test tab switching, minimize/restore, full screen/restore, drag, portrait/landscape/small viewport, PDF page/zoom retention, and notes edits syncing between two clients. Confirm none of this changes recording state. Existing clean BoardCanvas does not mount TalkingPoints. No new API credentials or paid API calls needed.
- Run typecheck, lint, relevant tests and build. Push final tested changes and merge main under the user's standing authorization. Do not claim physical iPad or native macOS verification from a Linux/cloud runner. Leave local signing/install for when the user's Mac is open again.

Useful files: src/components/board/TalkingPoints.tsx, PrivatePDFPanel.tsx, presenter.css, tabletPanels.ts, board.css, BoardCanvas.tsx; electron/board/presenter.ts, presentationPDF.ts. The iPad uses useTabletPanels(stage, tablet && !clean) and TalkingPoints dock={tablet}, with Notes openRequest. Existing panel state is local, separate from shared document state.

The user's Mac has ignored .tmp/pdf-qa-server.ts and .tmp/pdf-qa.tsx fixtures, unavailable in cloud. Build an equivalent disposable local fixture if needed using real PresenterStore/PresentationPDFStore, mock transport and a synthetic PDF. No secrets or private PDFs should be committed. The repository is https://github.com/nikooo11/MistaRecorda.git.
