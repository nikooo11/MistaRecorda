# YouTube upload — waiting for YouTube approval

After an MP4 export, choose **Upload to YouTube**. Nothing is uploaded until you click **Upload Private video**. Enter the title, description, tags, category, audience (“Made for kids”), optional thumbnail and editable chapters. **Save details for this project** remembers metadata on this Mac. Chapters draft from zooms and, for new recordings, scene changes and talking points checked as covered. Review them after editing; YouTube needs at least three chapters, the first at 00:00 and each at least ten seconds long.

Google testing mode permits listed test users only and may show an unverified-app warning. MistaRecorda enforces **Private** before approval, independently of the provider's current restrictions. Change visibility in YouTube Studio if needed. This application policy is intentional: Google's videos.insert documentation changed in October 2026, so do not rely on Google to enforce the lock.

## Connect and configure

Create a Google Cloud project, enable **YouTube Data API v3**, configure an External OAuth consent screen in Testing, and add test users. Create an OAuth **Desktop app** client, not a web-client redirect. Supply these only in the application's launch environment or private deployment configuration:

- `MISTARECORDA_YOUTUBE_CLIENT_ID`
- `MISTARECORDA_YOUTUBE_CLIENT_SECRET` (when issued for the desktop client)
- `MISTARECORDA_YOUTUBE_APPROVED=false` (default; only the exact value `true` enables Public/Unlisted)

Do not commit credentials. Launching a packaged Mac app from Finder does not inherit a shell's exported variables; a deployment must supply its private configuration to the app process. Missing configuration leaves the feature visibly unavailable, with the waiting-for-approval status, instead of breaking recording.

In **Settings → Setup**, click **Connect YouTube**. The system browser uses OAuth authorization code + PKCE S256 + random state; the temporary callback listens only on `127.0.0.1` at a random port, and closes on success, cancellation or timeout. The default scope is `youtube.upload`; channel profile access is not requested. Refresh credentials are encrypted with Electron safeStorage in `userData/publishing/youtube-token.enc`, never returned to renderer/iPad or copied into projects. **Disconnect** removes local credentials and attempts Google's revocation endpoint. Google Testing refresh tokens can expire; reconnect when prompted. Disconnecting offline removes the local token but may require removing access manually in Google Account permissions.

## Captions

Captions rendered into the exported video remain visible and need no additional scope. **Attach captions as a separate subtitle track** defaults off. If enabled without permission, upload is disabled with a message to turn off this option. **Save captions as SRT** reuses the caption sidecar serializer and lets you add subtitles in YouTube Studio.

An explicit **Reconnect with captions permission** requests `youtube.force-ssl` in addition to `youtube.upload`; this is broader permission to manage YouTube videos. Desktop OAuth does not support incremental authorization, so this is a full new consent grant. No extra permission is requested automatically. Captions use timed cues, not YouTube's deprecated `sync` parameter.

## Progress and recovery

Video data is sent in 8 MiB resumable chunks. A network failure probes Google's accepted byte range and retries with bounded backoff. The panel provides progress, Cancel and Retry. Retry continues the same upload in the current app session and refuses a changed local file. Upload sessions currently do not survive an app restart; keep the app running for a long upload. A quota/access error explains what to check; quota failures are not retried repeatedly.

Closing the panel does not cancel an active upload. If thumbnail/subtitle attachment fails after the video succeeds, the video link remains visible and Retry only retries remaining attachments. Cancellation cannot recall bytes already accepted by Google; if completion races cancellation, check YouTube Studio before starting a new upload. Your local export is never deleted or changed.

## Approval checklist still required

- Publish an owned domain, product homepage, support contact and privacy policy explaining Google data access, storage, deletion and uploads.
- Verify domain ownership and OAuth app branding; configure authorized contacts, scope justification and testing accounts.
- Record a demo showing consent, upload, disconnect and data handling; complete Google OAuth verification, including the broader captions scope if shipped.
- Complete the YouTube API Services compliance audit and any requested quota review. Confirm the final provider rules before changing the approval flag.
- Test real connection/refresh/revocation, Private upload, audience metadata, thumbnail, timed subtitles, quota errors and interrupted upload with a test channel. No real Google account or video was used in automated/UI fixture tests.
- Only then deploy `MISTARECORDA_YOUTUBE_APPROVED=true` and choose desired metadata presets. Private remains the initial privacy default.

## Implementation and validation

Provider boundary: `electron/publishing/provider.ts`; OAuth, resumable client, orchestration and markers are separate modules. `studio:request` retains its existing trusted main-frame checks; paired iPads cannot invoke publishing or retrieve credentials. Files must be approved local media. YouTube session URLs are restricted to Google's HTTPS upload endpoint. Runtime metadata and attachment sizes are validated.

Vitest covers PKCE/state/loopback cleanup, encrypted token persistence, scope opt-in, private lock, offset validation, recovery, quota, cancellation and marker drafts. Browser fixture verified the caption-permission warning, disabled Upload while selected, re-enabled Upload after deselection, metadata entry and success link. These are simulated uploads; real OAuth/upload remains unverified until credentials/test-channel access are configured.

References: [Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [resumable upload](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol), [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert), [captions.insert](https://developers.google.com/youtube/v3/docs/captions/insert).
