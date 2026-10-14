type PermissionAPI = Pick<
	Window["electronAPI"],
	"getPlatform" | "getScreenRecordingPermissionStatus" | "getAccessibilityPermissionStatus"
>;

export type MissingRecordingPermission = "screen" | "accessibility";

// Checking readiness never launches Settings or requests a grant. Only an
// explicit Open Settings action should interrupt the user's desktop.
export async function getMissingRecordingPermission(
	api: PermissionAPI,
): Promise<MissingRecordingPermission | null> {
	if ((await api.getPlatform()) !== "darwin") return null;
	const screen = await api.getScreenRecordingPermissionStatus();
	if (!screen.success || screen.status !== "granted") return "screen";
	const accessibility = await api.getAccessibilityPermissionStatus();
	return accessibility.success && accessibility.trusted ? null : "accessibility";
}
