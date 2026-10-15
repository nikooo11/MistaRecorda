import { afterEach, beforeEach, expect, test, vi } from "vitest";

const host = vi.hoisted(() => ({
	exec: vi.fn(),
	open: vi.fn(),
	fetch: vi.fn(),
	rm: vi.fn(),
	write: vi.fn(),
	digest: "",
	recording: false,
	streaming: false,
}));
vi.mock("node:child_process", async () => {
	const { promisify } = await import("node:util");
	return { execFile: Object.assign(vi.fn(), { [promisify.custom]: host.exec }) };
});
vi.mock("node:crypto", () => ({
	createHash: () => ({ update: () => ({ digest: () => host.digest }) }),
}));
vi.mock("node:fs/promises", () => ({
	default: {
		mkdtemp: async () => "/tmp/driver-qa",
		chmod: vi.fn(),
		writeFile: host.write,
		rm: host.rm,
	},
}));
vi.mock("electron", () => ({ app: { getPath: () => "/tmp" }, shell: { openPath: host.open } }));
vi.mock("../ipc/state", () => ({
	get isCursorCaptureActive() {
		return host.recording;
	},
}));
vi.mock("./streamAudio", () => ({ isStreaming: () => host.streaming }));
const signature =
	"Status: signed by a developer certificate issued by Apple for distribution\nDeveloper ID Installer: Existential Audio Inc. (Q5C99V536K)";
beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	vi.stubGlobal("fetch", host.fetch);
	vi.stubGlobal("process", { ...process, platform: "darwin" });
	host.recording = false;
	host.streaming = false;
	host.digest = "57b540f27a3e29c37e310e01bee0fdfab76733087e47f997ef9dccf851400dcf";
	host.exec.mockImplementation(async (file) => {
		if (file.endsWith("plutil")) throw Error("absent");
		return { stdout: signature };
	});
	host.fetch.mockImplementation(async () => new Response(new Uint8Array([1, 2, 3])));
	host.open.mockResolvedValue("");
	host.rm.mockResolvedValue(undefined);
	host.write.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());
test("recording-only status is read-only and never downloads or opens an installer", async () => {
	const { streamDriverInfo } = await import("./streamDriver");
	expect(await streamDriverInfo()).toMatchObject({ installed: false, phase: "idle" });
	expect(host.fetch).not.toHaveBeenCalled();
	expect(host.open).not.toHaveBeenCalled();
});
test("an installed driver is detected without replacing it", async () => {
	host.exec.mockResolvedValue({ stdout: "0.8.0\n" });
	const { installStreamDriver } = await import("./streamDriver");
	expect(await installStreamDriver()).toMatchObject({ installed: true, version: "0.8.0" });
	expect(host.fetch).not.toHaveBeenCalled();
});
test("coalesces install clicks, pins official URL and validates signature before opening; opening is not installation", async () => {
	const { installStreamDriver, streamDriverInfo, BLACKHOLE_PACKAGE } = await import(
		"./streamDriver"
	);
	const first = installStreamDriver();
	expect(installStreamDriver()).toBe(first);
	expect(await first).toMatchObject({ installed: false, phase: "installer-open" });
	expect(host.fetch).toHaveBeenCalledTimes(1);
	expect(host.fetch).toHaveBeenCalledWith(
		BLACKHOLE_PACKAGE.url,
		expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }),
	);
	expect(host.exec).toHaveBeenCalledWith(
		"/usr/sbin/pkgutil",
		["--check-signature", "/tmp/driver-qa/BlackHole2ch-0.7.1.pkg"],
		expect.anything(),
	);
	expect(host.write).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), {
		mode: 0o600,
	});
	expect(host.open).toHaveBeenCalledTimes(1);
	expect(await streamDriverInfo()).toMatchObject({ installed: false, phase: "installer-open" });
});
test.each([
	"checksum",
	"signature",
	"network",
	"size",
	"open",
])("fails closed on %s errors and allows retry", async (reason) => {
	if (reason === "checksum") host.digest = "wrong";
	// Keep the status probe absent; a bad signature is only supplied for pkgutil.
	if (reason === "signature")
		host.exec.mockReset().mockImplementation(async (file) => {
			if (file.endsWith("plutil")) throw Error("absent");
			return { stdout: "unsigned" };
		});
	if (reason === "network") host.fetch.mockRejectedValue(Error("offline"));
	if (reason === "size")
		host.fetch.mockResolvedValue(new Response(new Uint8Array(2 * 1024 * 1024 + 1)));
	if (reason === "open") host.open.mockResolvedValue("Installer unavailable");
	const { installStreamDriver, streamDriverInfo } = await import("./streamDriver");
	await expect(installStreamDriver()).rejects.toThrow();
	expect(await streamDriverInfo()).toMatchObject({
		installed: false,
		phase: "idle",
		error: expect.any(String),
	});
	if (reason !== "open") expect(host.open).not.toHaveBeenCalled();
	if (["signature", "open"].includes(reason))
		expect(host.rm).toHaveBeenCalledWith("/tmp/driver-qa", { recursive: true, force: true });
});
test.each(["recording", "streaming"] as const)("refuses setup during %s", async (key) => {
	host[key] = true;
	const { installStreamDriver } = await import("./streamDriver");
	await expect(installStreamDriver()).rejects.toThrow("Stop recording");
	expect(host.fetch).not.toHaveBeenCalled();
});
test("does not open Installer if recording starts during download", async () => {
	host.fetch.mockImplementation(async () => {
		host.recording = true;
		return new Response(new Uint8Array([1]));
	});
	const { installStreamDriver } = await import("./streamDriver");
	await expect(installStreamDriver()).rejects.toThrow("Stop recording");
	expect(host.open).not.toHaveBeenCalled();
});
