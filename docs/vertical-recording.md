# Record vertically, then send to phone

Choose a **screen source** in the Mac studio and enable **Vertical 9:16** before starting. This is a native macOS capture of a selected region at 1080 × 1920, not an export crop of a landscape take. Move the thin guide by its top edge. Uncheck **Lock frame size** to resize its corner while keeping 9:16. The last frame is remembered for the current project (new takes share a separate default frame).

The dim area, border and optional safe-area guides are private: never included in recordings, even when Show app windows in recording is enabled. The safe lines are conservative top/bottom presentation margins, not a guarantee against every platform's changing controls. The frame cannot move or resize during recording. Stop before changing it. Different window/display sources require disabling vertical mode first; scenes using the same display can change camera, audio and other layers.

The iPad mirrors the frame on the full Mac view. New memes, images, charts and attached references fit inside it using the board's actual zoom coordinates. Scene image/video layers and facecam placement use the framed area; cursor/zoom telemetry is normalized to it. Draw within the guide; existing drawings are not rearranged automatically. Fresh portrait media opens with native aspect and no padding. Vertical capture requires macOS native capture and will not silently fall back to a landscape recording.

After exporting an MP4, click **Send to phone / iPad**. The paired companion shows **Downloads** in its header, including the phone Remote page. Download to Files, then use Share → Save Video if offered, or choose the saved file in TikTok/Reels/YouTube. The local download expires after one hour or when MistaRecorda closes. Only already-approved paired devices can download it; revoking the device also revokes access. The app does not post to TikTok.

## Validation

- Unit coverage: negative monitor origins, 9:16 clamping, zoom-aware reference placement, active-recording frame lock, frame preferences and source mismatch.
- HTTP integration: authenticated MP4 download/range, unpaired denial, no sharing arbitrary desktop paths from a tablet, revocation.
- Browser fixture: toggled vertical mode and safe guides, dragged the frame, unlocked and resized from 337.5 × 600 to 281.25 × 500, retaining 9:16.
- Native helpers compile for Apple Silicon and Intel. Physical Mac capture, multi-monitor positioning and iOS Save Video still require device playtesting.

Manual check: enable vertical on a screen, drag/resize the guide, place a reference inside it, start a short take with facecam off, verify the guide cannot move and recording excludes it, stop and inspect the 1080 × 1920 file. Export, share, download on the paired iPad; revoke pairing and confirm that the old download link stops working.
