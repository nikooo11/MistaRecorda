// Native filters snapshot window IDs. Opening a private presenter window invalidates previews.
let revision = 0;
export function privateCaptureRevision() {
	return revision;
}
export function invalidatePrivateCapture() {
	revision++;
}
