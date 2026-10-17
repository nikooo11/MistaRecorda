# Speech-aligned captions — October 17, 2026

Reference: https://www.youtube.com/shorts/IgZmv1yz6C0, inspected in the user's
Chrome tab. The reference uses short, stable phrases, dark type on a white box,
and a cyan background behind the currently spoken word.

## Changes

- Whisper full JSON includes control/timestamp tokens with zero duration. The
  parser previously rejected an entire segment's word timings on encountering
  one of these tokens, silently leaving phrase-length interpolation. Ignore
  control tokens, join subwords/contractions, and keep punctuation from extending
  speech into a pause. Repair a zero-duration spoken token locally (at most 80 ms,
  bounded by the next onset), preserving the other measured word intervals.
- Highlight intervals are half-open: a word activates at its onset and stops at
  its offset. There is no previous-word fallback during silence. Single-word
  captions disappear during gaps. Short phrase context may remain across gaps
  under 500 ms without highlighting any word.
- Preview and both export renderers share timing, compact padding, and background
  color handling. Current word defaults to a white box, dark type and cyan
  highlighting. Colors remain editable and persist with the project. Single word
  defaults to no animation; optional animations scale their duration down for
  brief pages so fast speech is not permanently faded.
- Existing projects retain their text/corrections. Regenerate captions to recover
  discarded word timing; the settings explain this. Model timing is still an
  estimate, and engines without word timestamps still use approximate fallback.

## Validation

- Full suite: 1,447 tests passed; the subsequently added color-persistence test
  also passed with the caption regression set. Typecheck passed. Targeted lint
  passed with 16 existing warnings in large editor components.
- Real 15-second recording: the original saved project contained four cues and
  zero timed words. The same speech processed through the corrected parser and
  phrase segmenter produced four cues and 40 timed words.
- Browser playtest using the production canvas export renderer and that audio:
  real-time playback completed, word-onset/offset checks passed, contractions
  remained whole, and Single word was hidden during silence. Current word kept
  unhighlighted context during a brief pause. Screenshot:
  `.tmp/caption-highlight-playtest.png` (local only).
- Built and signed with the existing persistent Mac identity; installed bundle
  passed deep/strict signature verification. Original project saved and backed up;
  a separate “QA speech-aligned captions” project was made for regeneration/export.

- Installed-app regeneration passed in an isolated local test profile without
  accessing saved API keys. Saved project has 40 timed words; a separate QA copy
  was restored into the normal profile, leaving the original project untouched.
- Native Lightning export passed: 15.87 seconds, 1920×1080 H.264 at 30 fps,
  stereo AAC. The exported MP4 played to completion in Chrome. Extracted frames
  verified word transitions, no highlight in a short pause, intact contractions,
  and no caption in the final silence. Local artifacts:
  `.tmp/caption-timing-export.mp4`, `.tmp/caption-export-playtest.png`.
- Remaining limitation: native editor preview was blank in the test profile.
  Its packaged localhost load timed out (the server itself returned HTTP 200),
  and Chromium reported an AudioContext/audio-thread failure. Restarting the
  isolated app did not resolve it. This does not invalidate the verified native
  caption generation/export, but installed-editor playback is not verified.
- Normal-profile startup remains behind the macOS Keychain prompt after signing.
  Approval was requested; no password or saved API key was read or changed.
Facecam has remained off. No cloud speech API or credits were used.
