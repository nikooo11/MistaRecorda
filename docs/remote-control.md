# Phone, iPad and Stream Deck remote

Pair using the usual iPad QR code and approve the device on the Mac. Tap **Remote** in the companion header (or open `/remote` on that same paired host). **Canvas & notes** returns to the canvas, PDFs and presenter tools. The remote route uses the same approval, session token and revocation as the canvas; opening the URL alone grants no control.

The reserved Record/Stop and Pause/Resume bar is shared with the canvas. Mac status controls the timer and paused state. The grid offers scene recall, explicit facecam on/off, latched zoom in/out, whiteboard open/close, and saved voice choices. Zoom is available during an unpaused recording with zoom enabled; it targets the Mac cursor or the center if the cursor is outside the recorded source. Saved scenes apply their camera choices; scenes that include facecam are labeled. Nothing turns the camera on simply by opening Remote.

Favorite or loved sounds and memes appear in the grid. First tap stages privately; a second tap or **Deploy** plays the sound or places the meme at the presentation center, respecting the current canvas zoom and its saved effects/audio. **Cancel** clears the staged reference. Staging is separate for each paired device, never written to the recorded canvas, and deploy tokens are consumed once. Use **Canvas & notes** for precise placement/size/tilt. **Refresh favorites** reloads the library. Live polling omits large images and late snapshots cannot re-arm a deployed reference.

## Optional Stream Deck endpoint

On the Mac: Drawing studio → Settings → **Stream Deck remote control** → Enable. This starts an HTTP server on **127.0.0.1 only**, using a random port and bearer token. Both are shown locally and change when disabled/re-enabled or the app restarts. Keep the token private; it controls recording. This endpoint is not accessible over the LAN and is not shared with paired tablet pages. No browser origins or arbitrary IPC/shell commands are accepted.

Use a Stream Deck HTTP-request action/plugin capable of setting an Authorization header, or a local script that reads the token from an environment variable. Supply the displayed URL and token locally. Do not put secrets in exported Stream Deck profiles.

```sh
# Set these locally to the values displayed in the Mac app.
export MISTARECORDA_REMOTE_URL='http://127.0.0.1:PORT'
# MISTARECORDA_REMOTE_TOKEN should be set in your private local environment.
curl --fail --silent "$MISTARECORDA_REMOTE_URL/status" \
  -H "Authorization: Bearer $MISTARECORDA_REMOTE_TOKEN"

curl --fail --silent "$MISTARECORDA_REMOTE_URL/action" \
  -H "Authorization: Bearer $MISTARECORDA_REMOTE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"action":"record","intent":"start"}'
```

`GET /status` returns recording status, scene IDs/names, favorites and this controller's armed reference. `POST /action` accepts one of:

| Action | JSON fields |
|---|---|
| Record | `action: "record", intent: "start" / "stop" / "pause" / "resume"` |
| Scene | `action: "scene", id: "scene-uuid"` |
| Facecam | `action: "camera", enabled: true / false` |
| Zoom | `action: "zoom", enabled: true / false` |
| Whiteboard | `action: "whiteboard", enabled: true / false` |
| Stage | `action: "stage", kind: "sound" / "meme", id: "asset-uuid"` |
| Deploy | `action: "deploy", token: "armed-token-from-status"` |
| Cancel stage | `action: "cancelStage"` |
| Voice | `action: "voice", id: "saved-voice-id"` (empty string selects original) |

Use explicit Start and Stop buttons, or read current status before choosing the intent. Stale/duplicate record requests return a readable error rather than reversing a pending command. HTTP Stop is explicit and immediate; the companion's optional confirmation is a UI preference. Invalid actions return 400, missing/wrong auth or browser requests 403, oversized requests 413. Disable the endpoint in the app when finished.

## Validation

Vitest covers loopback binding, bearer auth, browser rejection, action allowlist, body limits, device approval, deploy-once isolation, late snapshots and exported remote zoom intervals. TypeScript and 1,467 tests pass. Browser fixture verified scene recall, private first tap (zero deployments), second-tap deployment, recording/pause/timer/stop using simulated Mac status. No actual camera activated.

Still required on hardware: pair a phone/iPad, recall a camera-off scene, record a disposable take, pause/resume and stop from both devices, verify zoom in the editor and favorites/audio placement. Test a real Stream Deck plugin with the session token. Desktop window capture/privacy checks remain in the main validation checklist.
