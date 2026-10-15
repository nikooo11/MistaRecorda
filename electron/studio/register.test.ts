import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AudioRegion } from "../../src/components/video-editor/types";

type Handler = (event: unknown, method: string, input?: unknown) => Promise<unknown>;
interface TestWindow {
	webContents: { getURL(): string; isDestroyed(): boolean; send: ReturnType<typeof vi.fn> };
	getTitle(): string;
	isDestroyed(): boolean;
	hide: ReturnType<typeof vi.fn>;
}
const host = vi.hoisted(() => ({
	previewCallbacks: [] as Array<(error: Error | null, stdout: string, stderr: string) => void>,
	root: "",
	windows: [] as TestWindow[],
	handlers: new Map<string, Handler>(),
	active: false,
	time: 1000,
	paused: false,
	importFile: "",
	bindings: new Map<string, () => void>(),
	sources: [] as Array<{ id: string; display_id?: string }>,
	selected: null as { id: string } | null,
	control: vi.fn(),
	nativeWrite: vi.fn(),
	native: false,
	nativeStdout: undefined as unknown as EventEmitter,
	nativeEvents: undefined as unknown as EventEmitter,
	nativeSources: [] as Array<{
		id: string;
		name: string;
		appName?: string;
		windowTitle?: string;
	}>,
	focus: vi.fn(async (_id: string) => ""),
}));
vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	const { promisify } = await import("node:util");
	const execute = promisify(actual.execFile);
	const execFile = Object.assign(
		(...args: unknown[]) => Reflect.apply(actual.execFile, undefined, args),
		{
			[promisify.custom]: (file: string, ...args: unknown[]) => {
				if (file !== "/usr/bin/afplay")
					return Reflect.apply(execute, undefined, [file, ...args]);
				return new Promise((resolve, reject) =>
					host.previewCallbacks.push((error, stdout, stderr) =>
						error ? reject(error) : resolve({ stdout, stderr }),
					),
				);
			},
		},
	);
	return { ...actual, execFile };
});
vi.mock("electron", () => ({
	app: { getPath: () => host.root, getAppPath: () => host.root, on: vi.fn() },
	BrowserWindow: class {
		static getAllWindows() {
			return host.windows;
		}
		webContents = {
			getURL: () => "data:text/html,glow",
			isDestroyed: () => false,
			send: vi.fn(),
		};
		constructor() {
			host.windows.push(this);
		}
		getTitle() {
			return "MistaRecorda Capture Glow";
		}
		isDestroyed() {
			return false;
		}
		setIgnoreMouseEvents() {}
		setVisibleOnAllWorkspaces() {}
		setContentProtection() {}
		loadURL = vi.fn(async () => {});
		hide = vi.fn();
	},
	dialog: {
		showOpenDialog: async () => ({ canceled: !host.importFile, filePaths: [host.importFile] }),
	},
	desktopCapturer: { getSources: async () => host.sources },
	globalShortcut: {
		isRegistered: (key: string) => host.bindings.has(key),
		unregister: (key: string) => host.bindings.delete(key),
		register: (key: string, action: () => void) => {
			if (host.bindings.has(key)) return false;
			host.bindings.set(key, action);
			return true;
		},
	},
	ipcMain: { handle: (name: string, handler: Handler) => host.handlers.set(name, handler) },
}));
vi.mock("./voiceCues", () => ({
	startVoiceCues: vi.fn(),
	persistVoiceCues: vi.fn(),
	recordingVoiceList: vi.fn(),
	selectRecordingVoice: vi.fn(),
}));
vi.mock("./focusWindow", () => ({ focusRecordingWindow: host.focus }));
vi.mock("../ipc/cursor/bounds", () => ({
	getNativeMacWindowSources: async () => host.nativeSources,
	resolveMacWindowBounds: async () => ({ x: 100, y: 100, width: 800, height: 600 }),
	startWindowBoundsCapture: vi.fn(async () => {}),
}));
vi.mock("../ipc/cursor/telemetry", () => ({
	getCursorCaptureElapsedMs: () => host.time,
	getRecordingBoundsInDips: () => null,
	isCursorCapturePaused: () => host.paused,
}));
vi.mock("../ipc/zoom/capture", () => ({
	zoomStatus: () => ({ outlineAvailable: false }),
	closeHeldZoom: vi.fn(),
}));
vi.mock("../ipc/state", () => ({
	get isCursorCaptureActive() {
		return host.active;
	},
	get selectedSource() {
		return host.selected;
	},
	setSelectedSource: (source: { id: string }) => {
		host.selected = source;
	},
	setSelectedWindowBounds: vi.fn(),
	get nativeScreenRecordingActive() {
		return host.native;
	},
	get nativeCaptureProcess() {
		return host.native
			? {
					stdin: { writable: true, write: host.nativeWrite },
					stdout: host.nativeStdout,
					once: (...args: Parameters<EventEmitter["once"]>) =>
						host.nativeEvents.once(...args),
					off: (...args: Parameters<EventEmitter["off"]>) =>
						host.nativeEvents.off(...args),
				}
			: null;
	},
}));
vi.mock("../ipc/project/manager", () => ({
	resolveApprovedLocalMediaPath: async (p: string) => p,
	rememberApprovedLocalReadPath: vi.fn(),
}));
vi.mock("../screenCaptureAccess", () => ({ requireScreenRecordingAccess: vi.fn() }));
vi.mock("../board/register", () => ({
	assertBoardCaptureSource: vi.fn(),
	sendRecordingControl: host.control,
	isDrawingSurfaceWindow: (w: TestWindow) =>
		w.webContents.getURL().includes("windowType=board-surface"),
}));
vi.mock("../rendererServer", () => ({
	getPackagedRendererBaseUrl: () => "http://127.0.0.1:9876/",
}));
vi.mock("../ipc/ffmpeg/binary", () => ({
	getFfmpegBinaryPath: () => path.join(process.cwd(), "node_modules/ffmpeg-static/ffmpeg"),
	getFfprobeBinaryPath: () =>
		path.join(
			process.cwd(),
			`node_modules/ffprobe-static/bin/${process.platform}/${process.arch}/ffprobe`,
		),
}));

import {
	boardSoundList,
	boardSoundPreview,
	persistStudioTake,
	prepareStudioCapture,
	registerStudio,
	startStudioTake,
	stopStudioTake,
} from "./register";

const actualPlatform = process.platform;
beforeEach(() => {
	host.previewCallbacks = [];
	host.nativeStdout = new EventEmitter();
	host.nativeEvents = new EventEmitter();
	host.focus.mockReset().mockResolvedValue("");
	host.nativeWrite.mockReset();
});
afterEach(async () => {
	Object.defineProperty(process, "platform", { value: actualPlatform });
	host.native = false;
	stopStudioTake();
	host.active = false;
	if (host.root) await fs.rm(host.root, { recursive: true, force: true });
});
test("saved display slots recall by click and hotkey and reject unavailable or live display changes", async () => {
	host.root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-window-slots-"));
	await fs.mkdir(path.join(host.root, "studio"));
	await fs.writeFile(
		path.join(host.root, "studio/settings.json"),
		JSON.stringify({ glow: true, windows: [], sounds: [] }),
	);
	host.selected = null;
	registerStudio();
	const frame = { url: "http://127.0.0.1:9876/?windowType=studio" };
	const event = { senderFrame: frame, sender: { mainFrame: frame } };
	const request = (method: string, input?: unknown) =>
		host.handlers.get("studio:request")!(event, method, input);
	const source = { id: "screen:12:0", name: "Display", display_id: "12", sourceType: "screen" };
	await request("assignWindow", { slot: 1, shortcut: "CommandOrControl+Alt+1", source });
	host.sources = [{ id: "screen:99:0", display_id: "12" }];
	await request("switch", 1);
	expect(host.selected).toMatchObject({ id: "screen:99:0", sourceType: "screen" });
	host.selected = null;
	host.bindings.get("CommandOrControl+Alt+1")!();
	await vi.waitFor(() => expect(host.selected?.id).toBe("screen:99:0"));
	host.active = true;
	host.selected = { id: "window:25:0" };
	await expect(request("switch", 1)).rejects.toThrow("Stop recording");
	expect(host.selected.id).toBe("window:25:0");
	host.active = false;
	host.sources = [];
	await expect(request("switch", 1)).rejects.toThrow("unavailable");
	expect(host.selected.id).toBe("window:25:0");
	await request("removeWindow", 1);
	expect(host.bindings.has("CommandOrControl+Alt+1")).toBe(false);
});
test("saved source scenes apply camera only after source validation and shortcuts persist", async () => {
	host.root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-scenes-"));
	host.selected = null;
	host.control.mockClear();
	registerStudio();
	const frame = { url: "http://127.0.0.1:9876/?windowType=studio" };
	const event = { senderFrame: frame, sender: { mainFrame: frame } };
	const request = (method: string, input?: unknown) =>
		host.handlers.get("studio:request")!(event, method, input);
	await request("info");
	const scene = {
		id: crypto.randomUUID(),
		name: "Tutorial",
		source: { id: "screen:42:0", name: "Screen", display_id: "42", sourceType: "screen" },
		camera: true,
		shortcut: "CommandOrControl+Alt+7",
	};
	await request("saveScene", scene);
	host.sources = [];
	await expect(request("applyScene", scene.id)).rejects.toThrow("unavailable");
	expect(host.control).not.toHaveBeenCalled();
	expect(host.selected).toBeNull();
	host.sources = [{ id: "screen:42:0", display_id: "42" }];
	await request("applyScene", scene.id);
	expect(host.selected).toMatchObject({ id: "screen:42:0" });
	expect(host.control).toHaveBeenLastCalledWith("webcam-on");
	await expect(request("cameraShortcut", scene.shortcut)).rejects.toThrow("one action");
	await request("cameraShortcut", "CommandOrControl+Alt+9");
	expect(host.bindings.has("CommandOrControl+Shift+W")).toBe(false);
	host.bindings.get("CommandOrControl+Alt+9")!();
	expect(host.control).toHaveBeenLastCalledWith("webcam");
	const saved = JSON.parse(
		await fs.readFile(path.join(host.root, "studio/settings.json"), "utf8"),
	);
	expect(saved.scenes[0]).toMatchObject(scene);
	expect(saved.cameraShortcut).toBe("CommandOrControl+Alt+9");
});
function window(kind: string, title = "MistaRecorda") {
	return {
		webContents: {
			getURL: () => `http://127.0.0.1:9876/?windowType=${kind}`,
			isDestroyed: () => false,
			send: vi.fn(),
		},
		getTitle: () => title,
		isDestroyed: () => false,
		hide: vi.fn(),
	};
}
test("pre-capture hides recorder, settings and menus while retaining only the clean drawing surface", async () => {
	const controls = [
		window("hud-overlay"),
		window("voice"),
		window("studio"),
		window("board-panel"),
		window("board-editor"),
	];
	const surface = window("board-surface", "Unexpected page title");
	const countdown = window("countdown");
	host.windows = [...controls, surface, countdown];
	await prepareStudioCapture();
	for (const control of controls) expect(control.hide).toHaveBeenCalledOnce();
	expect(surface.hide).not.toHaveBeenCalled();
	expect(countdown.hide).not.toHaveBeenCalled();
});
test("sound hotkey cues survive recording persistence, ignore pause, and cannot load a redirected sidecar", async () => {
	host.root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-integration-"));
	const id = crypto.randomUUID(),
		file = `${id}.wav`;
	await fs.mkdir(path.join(host.root, "studio"));
	await fs.writeFile(path.join(host.root, "studio", file), "sound fixture");
	await fs.writeFile(
		path.join(host.root, "studio/settings.json"),
		JSON.stringify({
			glow: true,
			windows: [],
			includeSoundboardInRecording: false,
			sounds: [{ id, file, name: "Chime", durationMs: 500, volume: 0.7, shortcut: "" }],
		}),
	);
	registerStudio();
	const frame = { url: "http://127.0.0.1:9876/?windowType=studio" };
	const event = { senderFrame: frame, sender: { mainFrame: frame } };
	const request = (method: string, input?: unknown) =>
		host.handlers.get("studio:request")!(event, method, input);
	await request("info");
	startStudioTake();
	host.active = true;
	host.time = 1300;
	await request("fireSound", id);
	host.paused = true;
	host.time = 1800;
	await expect(request("fireSound", id)).rejects.toThrow("Resume recording");
	host.paused = false;
	const video = path.join(host.root, "take.mp4");
	await persistStudioTake(video);
	const cues = (await request("soundsForVideo", video)) as AudioRegion[];
	expect(cues).toHaveLength(1);
	expect(cues[0]).toMatchObject({ startMs: 1300, endMs: 1800, volume: 0.7 });
	expect(await fs.readFile(cues[0].audioPath, "utf8")).toBe("sound fixture");
	await fs.unlink(cues[0].audioPath);
	await fs.symlink(path.join(host.root, "studio", file), cues[0].audioPath);
	expect(await request("soundsForVideo", video)).toEqual([]);
	const untrusted = { senderFrame: { url: "https://example.com" }, sender: { mainFrame: frame } };
	await expect(host.handlers.get("studio:request")!(untrusted, "info")).rejects.toThrow(
		"Untrusted",
	);
});

test("sound import cancels cleanly and converts an audio file to a persistent WAV copy", async () => {
	host.root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-import-"));
	await fs.mkdir(path.join(host.root, "studio"));
	await fs.writeFile(
		path.join(host.root, "studio/settings.json"),
		JSON.stringify({ glow: true, windows: [], sounds: [] }),
	);
	registerStudio();
	const frame = { url: "http://127.0.0.1:9876/?windowType=studio" };
	const event = { senderFrame: frame, sender: { mainFrame: frame } };
	const request = (method: string, input?: unknown) =>
		host.handlers.get("studio:request")!(event, method, input);
	host.importFile = "";
	const cancelled = (await request("importSound")) as { settings: { sounds: unknown[] } };
	expect(cancelled.settings.sounds).toEqual([]);
	const source = Buffer.alloc(44 + 9600);
	source.write("RIFF");
	source.writeUInt32LE(source.length - 8, 4);
	source.write("WAVEfmt ", 8);
	source.writeUInt32LE(16, 16);
	source.writeUInt16LE(1, 20);
	source.writeUInt16LE(1, 22);
	source.writeUInt32LE(48000, 24);
	source.writeUInt32LE(96000, 28);
	source.writeUInt16LE(2, 32);
	source.writeUInt16LE(16, 34);
	source.write("data", 36);
	source.writeUInt32LE(9600, 40);
	host.importFile = path.join(host.root, "My chime.wav");
	await fs.writeFile(host.importFile, source);
	const imported = (await request("importSound")) as {
		settings: { sounds: { id: string; name: string; durationMs: number; file: string }[] };
	};
	expect(imported.settings.sounds).toHaveLength(1);
	const sound = imported.settings.sounds[0];
	expect(sound.name).toBe("My chime");
	expect(sound.durationMs).toBe(100);
	expect((await fs.stat(path.join(host.root, "studio", sound.file))).size).toBeGreaterThan(9600);
	expect(await fs.readFile(host.importFile)).toEqual(source);
	expect(await request("soundPath", sound.id)).toBe(path.join(host.root, "studio", sound.file));
});

test("environment audio defaults can be muted and restored live without losing the captured tracks", async () => {
	host.root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-environment-audio-"));
	registerStudio();
	const frame = { url: "http://127.0.0.1:9876/?windowType=studio" };
	const event = { senderFrame: frame, sender: { mainFrame: frame } };
	const request = (method: string, input?: unknown) =>
		host.handlers.get("studio:request")!(event, method, input);
	await request("info");
	const source = { id: "screen:42:0", name: "Screen", display_id: "42", sourceType: "screen" };
	host.sources = [source];
	await request("selectSource", source);
	const scene = {
		id: crypto.randomUUID(),
		name: "Quiet demo",
		source,
		camera: false,
		shortcut: "",
		audio: { microphone: false, system: false },
	};
	await request("saveScene", scene);
	await request("audioStatus", { recording: false, microphone: true, system: true });
	await request("audioStatus", { recording: true, microphone: true, system: true });
	host.active = true;
	host.native = true;
	host.control.mockClear();
	host.nativeWrite.mockClear();
	await request("applyScene", scene.id);
	expect(host.nativeWrite).toHaveBeenCalledWith("audio off off\n");
	expect(host.control).toHaveBeenCalledWith("microphone-off");
	expect(host.control).toHaveBeenCalledWith("system-audio-off");
	host.active = false;
	await request("saveScene", { ...scene, audio: { microphone: true, system: true } });
	host.active = true;
	await request("applyScene", scene.id);
	expect(host.nativeWrite).toHaveBeenLastCalledWith("audio on on\n");
	expect(host.control).toHaveBeenCalledWith("microphone-on");
	expect(host.control).toHaveBeenCalledWith("system-audio-on");
	await request("audioStatus", { recording: false, microphone: false, system: true });
	await request("audioStatus", { recording: true, microphone: false, system: true });
	host.control.mockClear();
	await expect(request("applyScene", scene.id)).rejects.toThrow("started without");
	expect(host.control).not.toHaveBeenCalled();
	host.native = false;
});

test("renaming a source preserves its capture identity and persists across refresh", async () => {
	host.root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-source-name-"));
	registerStudio();
	const frame = { url: "http://127.0.0.1:9876/?windowType=studio" };
	const event = { senderFrame: frame, sender: { mainFrame: frame } };
	const request = (method: string, input?: unknown) =>
		host.handlers.get("studio:request")!(event, method, input);
	const source = {
		id: "window:888:0",
		name: "Google Chrome — Example",
		appName: "Google Chrome",
		windowTitle: "Example",
		sourceType: "window",
	};
	await request("renameSource", { source, name: "Article" });
	const saved = JSON.parse(
		await fs.readFile(path.join(host.root, "studio/settings.json"), "utf8"),
	);
	expect(saved.sourceAliases).toEqual([{ source, name: "Article" }]);
	expect(saved.sourceAliases[0].source.windowTitle).toBe("Example");
	await request("renameSource", { source, name: "Reference" });
	const renamed = (await request("info")) as { settings: { sourceAliases: unknown[] } };
	expect(renamed.settings.sourceAliases).toEqual([{ source, name: "Reference" }]);
	await request("renameSource", { source, name: "" });
	const reset = (await request("info")) as { settings: { sourceAliases: unknown[] } };
	expect(reset.settings.sourceAliases).toEqual([]);
});

async function windowSwitchSetup() {
	Object.defineProperty(process, "platform", { value: "darwin" });
	host.root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-window-focus-"));
	registerStudio();
	const frame = { url: "http://127.0.0.1:9876/?windowType=studio" };
	const event = { senderFrame: frame, sender: { mainFrame: frame } };
	const request = (method: string, input?: unknown) =>
		host.handlers.get("studio:request")!(event, method, input);
	await request("info");
	const source = {
		id: "window:91:0",
		name: "Chrome — Article",
		appName: "Chrome",
		windowTitle: "Article",
		sourceType: "window",
	};
	host.nativeSources = [source];
	host.selected = { id: "window:90:0" };
	host.native = true;
	host.active = true;
	return { request, source };
}

test("window hotkey raises the resolved target only after the recorder confirms the switch", async () => {
	const { request, source } = await windowSwitchSetup();
	// A saved window may have been recreated. Always focus the resolved native ID.
	host.active = false;
	await request("assignWindow", {
		slot: 1,
		shortcut: "F8",
		source: { ...source, id: "window:81:0" },
	});
	host.active = true;
	host.bindings.get("F8")!();
	await vi.waitFor(() => expect(host.nativeWrite).toHaveBeenCalledWith("switch-window 91\n"));
	expect(host.focus).not.toHaveBeenCalled();
	host.nativeStdout.emit("data", Buffer.from("SOURCE_SWITCHED 91\n"));
	await vi.waitFor(() => expect(host.focus).toHaveBeenCalledWith("window:91:0"));
	expect(host.selected?.id).toBe("window:91:0");
	await vi.waitFor(async () => expect(await request("info")).toMatchObject({ switching: false }));
	// Pressing the current window's hotkey again restores focus without recapturing.
	host.nativeWrite.mockClear();
	host.focus.mockClear();
	host.active = true;
	host.bindings.get("F8")!();
	await vi.waitFor(() => expect(host.focus).toHaveBeenCalledWith("window:91:0"));
	expect(host.nativeWrite).not.toHaveBeenCalled();
});

test("failed and closed window switches do not steal focus or change the recording source", async () => {
	const { request, source } = await windowSwitchSetup();
	const switching = request("selectSource", source);
	const rejection = expect(switching).rejects.toThrow("current recording continues");
	await vi.waitFor(() => expect(host.nativeWrite).toHaveBeenCalled());
	host.nativeStdout.emit("data", Buffer.from("SOURCE_SWITCH_FAILED\n"));
	await rejection;
	expect(host.selected?.id).toBe("window:90:0");
	expect(host.focus).not.toHaveBeenCalled();
	host.nativeSources = [];
	await expect(request("selectSource", source)).rejects.toThrow("closed");
	expect(host.focus).not.toHaveBeenCalled();
});

test("environment shortcuts restore current-window focus and retain activation warnings", async () => {
	const { request, source } = await windowSwitchSetup();
	host.selected = source;
	const scene = {
		id: crypto.randomUUID(),
		name: "Article",
		source,
		camera: false,
		shortcut: "F9",
	};
	host.active = false;
	await request("saveScene", scene);
	host.active = true;
	host.focus.mockResolvedValue("Allow Accessibility to bring windows to the front.");
	host.bindings.get("F9")!();
	await vi.waitFor(async () =>
		expect(await request("info")).toMatchObject({
			switching: false,
			message: "Scene: Article. Allow Accessibility to bring windows to the front.",
		}),
	);
	expect(host.focus).toHaveBeenCalledWith(source.id);
	expect(host.selected?.id).toBe(source.id);
	expect(host.nativeWrite).not.toHaveBeenCalled();
	host.active = false;
	host.focus.mockClear();
	await request("selectSource", source);
	expect(host.focus).not.toHaveBeenCalled();
});

test("startup persists bundled defaults and exposes playable clips to Mac and iPad without resetting removed sounds", async () => {
	host.root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-default-pack-"));
	await fs.cp(
		path.resolve("public/sounds/starter-v1"),
		path.join(host.root, "public/sounds/starter-v1"),
		{ recursive: true },
	);
	await fs.mkdir(path.join(host.root, "studio"));
	await fs.writeFile(
		path.join(host.root, "studio/settings.json"),
		JSON.stringify({ glow: true, windows: [], sounds: [] }),
	);
	const frame = { url: "http://127.0.0.1:9876/?windowType=studio" };
	const event = { senderFrame: frame, sender: { mainFrame: frame } };
	const request = (method: string, input?: unknown) =>
		host.handlers.get("studio:request")!(event, method, input);
	registerStudio();
	await request("info");
	const listed = boardSoundList().sounds;
	expect(listed.map((s) => s.name)).toEqual([
		"Fahhhhh",
		"Core",
		"Shocked",
		"Bass Drop",
		"Boom Timer",
		"Bow and Arrow",
		"Gear",
	]);
	for (const sound of listed)
		expect((await boardSoundPreview(sound.id)).dataURL).toMatch(
			/^data:audio\/wav;base64,UklGR/,
		);
	const persisted = JSON.parse(
		await fs.readFile(path.join(host.root, "studio/settings.json"), "utf8"),
	);
	expect(persisted.installedDefaultSoundIds).toHaveLength(7);
	await request("removeSound", listed[0].id);
	registerStudio();
	await request("info");
	expect(boardSoundList().sounds).toHaveLength(6);
	host.active = true;
	await expect(request("restoreDefaultSounds")).rejects.toThrow("Stop recording");
	host.active = false;
	await request("restoreDefaultSounds");
	expect(boardSoundList().sounds).toHaveLength(7);
	persisted.sounds[0].shortcut = persisted.cameraShortcut;
	await fs.writeFile(path.join(host.root, "studio/settings.json"), JSON.stringify(persisted));
	registerStudio();
	await expect(request("info")).resolves.toMatchObject({
		message: "Some saved shortcuts could not be restored. Review Capture settings.",
	});
	const broken = "{unfinished settings";
	await fs.writeFile(path.join(host.root, "studio/settings.json"), broken);
	registerStudio();
	await request("info");
	expect(await fs.readFile(path.join(host.root, "studio/settings.json"), "utf8")).toBe(broken);
});

test("preview status ends with playback and older sounds cannot clear newer notices", async () => {
	Object.defineProperty(process, "platform", { value: "darwin" });
	host.root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-preview-status-"));
	await fs.mkdir(path.join(host.root, "studio"));
	await fs.writeFile(
		path.join(host.root, "studio/settings.json"),
		JSON.stringify({
			glow: false,
			windows: [],
			sounds: [
				{
					id: "11111111-1111-4111-8111-111111111111",
					name: "Bass Drop",
					file: "11111111-1111-4111-8111-111111111111.wav",
					durationMs: 2900,
					shortcut: "",
					volume: 1,
				},
				{
					id: "22222222-2222-4222-8222-222222222222",
					name: "Chime",
					file: "22222222-2222-4222-8222-222222222222.wav",
					durationMs: 800,
					shortcut: "",
					volume: 1,
				},
			],
		}),
	);
	registerStudio();
	const frame = { url: "http://127.0.0.1:9876/?windowType=studio" };
	const event = { senderFrame: frame, sender: { mainFrame: frame } };
	const request = (method: string, input?: unknown) =>
		host.handlers.get("studio:request")!(event, method, input) as Promise<{ message: string }>;
	expect((await request("fireSound", "11111111-1111-4111-8111-111111111111")).message).toContain(
		"Playing Bass Drop",
	);
	await request("fireSound", "22222222-2222-4222-8222-222222222222");
	host.previewCallbacks.shift()!(null, "", "");
	expect((await request("info")).message).toContain("Playing Chime");
	host.previewCallbacks.shift()!(null, "", "");
	await vi.waitFor(async () => expect((await request("info")).message).toBe(""));
	await request("fireSound", "11111111-1111-4111-8111-111111111111");
	host.previewCallbacks.shift()!(new Error("Audio device disconnected"), "", "");
	await vi.waitFor(async () =>
		expect((await request("info")).message).toContain("Audio device disconnected"),
	);
});

test("native application exclusion keeps the studio usable without exposing other panels", async () => {
	const recorder = window("hud-overlay");
	const settings = window("studio");
	const surface = window("board-surface");
	host.windows = [recorder, settings, surface];
	await prepareStudioCapture(true);
	expect(recorder.hide).not.toHaveBeenCalled();
	expect(settings.hide).toHaveBeenCalledOnce();
	expect(surface.hide).not.toHaveBeenCalled();
});
