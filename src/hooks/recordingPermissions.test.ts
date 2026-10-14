import { describe, expect, it, vi } from "vitest";
import { getMissingRecordingPermission } from "./recordingPermissions";

describe("recording permission readiness", () => {
	const api = () => ({
		getPlatform: vi.fn(async () => "darwin"),
		getScreenRecordingPermissionStatus: vi.fn(async () => ({
			success: true,
			status: "granted",
		})),
		getAccessibilityPermissionStatus: vi.fn(async () => ({
			success: true,
			trusted: true,
			prompted: false,
		})),
	});
	it("distinguishes an approved screen grant from a missing Accessibility grant", async () => {
		const a = api();
		a.getAccessibilityPermissionStatus.mockResolvedValue({
			success: true,
			trusted: false,
			prompted: false,
		});
		expect(await getMissingRecordingPermission(a)).toBe("accessibility");
		a.getAccessibilityPermissionStatus.mockResolvedValue({
			success: true,
			trusted: true,
			prompted: false,
		});
		expect(await getMissingRecordingPermission(a)).toBeNull();
	});
	it("reports missing screen access without starting a second permission request", async () => {
		const a = api();
		a.getScreenRecordingPermissionStatus.mockResolvedValue({ success: true, status: "denied" });
		expect(await getMissingRecordingPermission(a)).toBe("screen");
		expect(a.getAccessibilityPermissionStatus).not.toHaveBeenCalled();
	});
	it("does not query macOS grants on Windows or Linux", async () => {
		const a = api();
		a.getPlatform.mockResolvedValue("win32");
		expect(await getMissingRecordingPermission(a)).toBeNull();
		expect(a.getScreenRecordingPermissionStatus).not.toHaveBeenCalled();
	});
});
