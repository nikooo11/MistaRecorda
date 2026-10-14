import { afterEach, describe, expect, it, vi } from "vitest";
const permission = vi.hoisted(() => vi.fn());
vi.mock("electron", () => ({ systemPreferences: { getMediaAccessStatus: permission } }));
import { requireScreenRecordingAccess } from "./screenCaptureAccess";

afterEach(() => {
	vi.restoreAllMocks();
	permission.mockReset();
});
describe("screen capture access before enumeration", () => {
	it.each([
		"denied",
		"not-determined",
		"restricted",
		"unknown",
	])("stops %s access without launching a capture API or requesting again", (status) => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		permission.mockReturnValue(status);
		expect(requireScreenRecordingAccess).toThrow("older build’s approval");
		expect(permission).toHaveBeenCalledWith("screen");
	});
	it("rechecks and accepts a grant after approval", () => {
		vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
		permission.mockReturnValueOnce("denied").mockReturnValueOnce("granted");
		expect(requireScreenRecordingAccess).toThrow();
		expect(requireScreenRecordingAccess).not.toThrow();
	});
	it.each(["win32", "linux"] as const)("does not query macOS permissions on %s", (platform) => {
		vi.spyOn(process, "platform", "get").mockReturnValue(platform);
		expect(requireScreenRecordingAccess).not.toThrow();
		expect(permission).not.toHaveBeenCalled();
	});
});
