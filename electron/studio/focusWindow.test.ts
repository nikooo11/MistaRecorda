import { afterEach, beforeEach, expect, test, vi } from "vitest";

const host = vi.hoisted(() => ({ exec: vi.fn(), binary: vi.fn(async () => "/test/window-list") }));
vi.mock("node:child_process", () => ({ execFile: host.exec }));
vi.mock("../ipc/paths/binaries", () => ({ ensureNativeWindowListBinary: host.binary }));

import { focusRecordingWindow } from "./focusWindow";

const platform = process.platform;
beforeEach(() => {
	Object.defineProperty(process, "platform", { value: "darwin" });
	host.exec.mockReset();
	host.binary.mockClear();
});
afterEach(() => Object.defineProperty(process, "platform", { value: platform }));

test("activates by numeric native window ID without a shell or title-based script", async () => {
	host.exec.mockImplementation((_file, _args, _options, callback) =>
		callback(null, { stdout: "WINDOW_FOCUSED 91\n" }),
	);
	expect(await focusRecordingWindow("window:91:0")).toBe("");
	expect(host.exec).toHaveBeenCalledWith(
		"/test/window-list",
		["--focus", "91"],
		{ timeout: 5000, maxBuffer: 4096 },
		expect.any(Function),
	);
});

test("returns an actionable permission warning without prompting during a take", async () => {
	host.exec.mockImplementation((_file, _args, _options, callback) =>
		callback(Object.assign(Error("denied"), { stderr: "ACCESSIBILITY_PERMISSION_REQUIRED" })),
	);
	expect(await focusRecordingWindow("window:91:0")).toContain(
		"Privacy & Security → Accessibility",
	);
});

test("does not report success for a timeout or a stale helper that only lists windows", async () => {
	host.exec.mockImplementation((_file, _args, _options, callback) => callback(Error("timeout")));
	expect(await focusRecordingWindow("window:91:0")).toContain("could not be brought");
	host.exec.mockImplementation((_file, _args, _options, callback) =>
		callback(null, { stdout: "[]" }),
	);
	expect(await focusRecordingWindow("window:91:0")).toContain("could not be brought");
});

test("ignores displays, malformed IDs and non-Mac hosts", async () => {
	for (const id of ["screen:1:0", "window:0:0", "window:99999999999:0", "window:1;open:0"])
		expect(await focusRecordingWindow(id)).toContain("could not");
	Object.defineProperty(process, "platform", { value: "win32" });
	expect(await focusRecordingWindow("window:91:0")).toBe("");
	expect(host.binary).not.toHaveBeenCalled();
});
