# Recorded zooms with a facecam

Fixed on 2026-10-15. A companion facecam saved through the same finalizer as the screen recording. If the facecam finished first, it consumed the held/tapped Z zooms and wrote their sidecar next to the facecam. The screen editor then loaded no zooms. It could also end an active zoom if the facecam was switched off during the take.

Companion facecam files now receive video validation only. They cannot finalize screen zooms, cursor telemetry, scene media or sound cues, replace the current editor source, or prune recordings. The screen recording owns those operations.

Regression tests exercise the real zoom capture and finalization path in both save orders, including a held cursor-follow zoom and a tap-locked zoom still active when the facecam finishes. They verify both regions and cursor data on the screen video, no corresponding sidecars on the facecam, and unchanged source/project state until the screen finishes.

The combined AI-chart/studio branch passes 1,353 tests across 172 files, TypeScript, the production build, and the Electron main smoke check. Live Apple Pencil and live OpenAI chart extraction remain outside this merge check; see `ai-charts.md` for chart validation limits.
