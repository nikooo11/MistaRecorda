import { systemPreferences } from "electron";

// Enumeration can display the same system prompt as recording. Check first so
// opening settings, refreshing sources, or retrying cannot cause prompt loops.
export function requireScreenRecordingAccess() {
	if (
		process.platform === "darwin" &&
		systemPreferences.getMediaAccessStatus("screen") !== "granted"
	) {
		throw new Error(
			"macOS has not authorized this build of MistaRecorda. If Screen Recording is already enabled, quit the app and re-add /Applications/MistaRecorda.app in Screen & System Audio Recording. An older build’s approval may no longer match.",
		);
	}
}
