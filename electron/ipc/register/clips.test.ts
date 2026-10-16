import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, expect, test, vi } from "vitest";

const host = vi.hoisted(() => ({
	handlers: new Map<string, (event: unknown, input?: unknown) => unknown>(),
	dir: "",
	state: {
		currentVideoPath: null as string | null,
		currentRecordingSession: null as { videoPath: string; webcamPath?: string } | null,
	},
	append: vi.fn(),
	editor: { webContents: { send: vi.fn() }, isDestroyed: () => false },
}));
vi.mock("electron", () => ({
	app: { getPath: () => "/tmp", getAppPath: () => process.cwd(), isPackaged: false },
	BrowserWindow: {
		getAllWindows: () => [host.editor],
		fromWebContents: () => host.editor,
	},
	ipcMain: {
		handle: (name: string, fn: (event: unknown, input?: unknown) => unknown) =>
			host.handlers.set(name, fn),
		on: vi.fn(),
	},
}));
vi.mock("../state", () => ({
	get currentVideoPath() {
		return host.state.currentVideoPath;
	},
	get currentRecordingSession() {
		return host.state.currentRecordingSession;
	},
	setCurrentVideoPath: (v: string | null) => {
		host.state.currentVideoPath = v;
	},
	setCurrentRecordingSession: (v: typeof host.state.currentRecordingSession) => {
		host.state.currentRecordingSession = v;
	},
}));
vi.mock("../utils", () => ({
	getRecordingsDir: async () => host.dir,
	isAutoRecordingPath: (p: string) => path.basename(p).startsWith("recording-"),
}));
vi.mock("../project/manager", () => ({
	isPathInsideDirectory: (p: string, dir: string) => p.startsWith(`${dir}${path.sep}`),
	rememberApprovedLocalReadPath: vi.fn(),
}));
vi.mock("../project/session", () => ({ resolveRecordingSession: async () => null }));
vi.mock("../recording/prune", () => ({ isProtectedRecording: async () => false }));
vi.mock("../recording/appendClip", async (load) => ({
	...(await load<typeof import("../recording/appendClip")>()),
	appendRecordingClip: host.append,
}));

import { registerClipHandlers } from "./clips";

const windows = {
	showRecorder: vi.fn(),
	showEditor: vi.fn(),
	hideEditor: vi.fn(),
	closeEditor: vi.fn(),
};
registerClipHandlers(windows);
const call = (name: string, input?: unknown) => host.handlers.get(name)!({ sender: {} }, input);

beforeEach(async () => {
	host.dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "clips-")));
	for (const fn of Object.values(windows)) fn.mockClear();
	host.append.mockReset();
});

test("records a clip from the editor and joins it onto the open recording", async () => {
	const base = path.join(host.dir, "recording-1.mp4");
	const take = path.join(host.dir, "recording-2.mp4");
	await fs.writeFile(take, "x");
	await fs.writeFile(`${take}.cursor.json`, "{}");
	host.state.currentVideoPath = base;
	host.state.currentRecordingSession = { videoPath: base, webcamPath: "/cam.mp4" };
	expect(await call("clip:record")).toEqual({ pending: true });
	expect(windows.hideEditor).toHaveBeenCalledWith(host.editor);
	expect(windows.showRecorder).toHaveBeenCalled();
	await expect(call("clip:append")).rejects.toThrow("No new clip");

	host.state.currentVideoPath = take;
	host.append.mockResolvedValue({
		videoPath: path.join(host.dir, "recording-3.mp4"),
		webcamPath: null,
		firstDurationMs: 1000,
		secondDurationMs: 500,
	});
	const result = (await call("clip:append")) as { firstHadWebcam: boolean; basePath: string };
	expect(host.append.mock.calls[0][0]).toEqual({
		videoPath: base,
		webcamPath: "/cam.mp4",
		timeOffsetMs: undefined,
	});
	expect(result).toMatchObject({ basePath: base, firstHadWebcam: true });
	expect(host.state.currentVideoPath).toBe(path.join(host.dir, "recording-3.mp4"));
	// The separate take is folded into the joined recording.
	expect(await fs.readdir(host.dir)).toEqual([]);
	expect(await call("clip:status")).toEqual({ pending: false });
});

test("cancelling returns to the editor without recording", async () => {
	host.state.currentVideoPath = path.join(host.dir, "recording-1.mp4");
	await call("clip:record");
	expect(await call("clip:cancel")).toEqual({ pending: false });
	expect(windows.showEditor).toHaveBeenCalled();
	await expect(call("clip:append")).rejects.toThrow("No clip is being recorded");
});

test("discarding only deletes auto recordings in the recordings folder", async () => {
	const video = path.join(host.dir, "recording-5.mp4");
	await fs.writeFile(video, "x");
	await fs.writeFile(path.join(host.dir, "recording-5.mic.wav"), "x");
	await fs.writeFile(path.join(host.dir, "recording-50.mp4"), "x");
	const outside = path.join(os.tmpdir(), `recording-${Date.now()}.mp4`);
	await fs.writeFile(outside, "x");
	await expect(call("clip:discard", { videoPath: outside })).rejects.toThrow("Only unsaved");
	await fs.access(outside);
	await fs.rm(outside);

	host.state.currentVideoPath = video;
	await call("clip:discard-and-record", { videoPath: video });
	expect(await fs.readdir(host.dir)).toEqual(["recording-50.mp4"]);
	expect(host.state.currentVideoPath).toBeNull();
	expect(windows.showRecorder).toHaveBeenCalled();
	expect(windows.closeEditor).toHaveBeenCalledWith(host.editor);
});
