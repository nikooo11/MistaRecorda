import { shouldHidePanel, showCapturePanel } from "../panelToggle";
import { ensureDrawingSurfaceReady, captureWindowId } from "./captureReady";
import { requireScreenRecordingAccess } from "../screenCaptureAccess";
import { EdgeBoardTrigger } from "./edgeTrigger";
import { z } from "zod";
import {
	app,
	BrowserWindow,
	ipcMain,
	screen,
	globalShortcut,
	desktopCapturer,
	type IpcMainInvokeEvent,
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { getPackagedRendererBaseUrl } from "../rendererServer";
import { BoardStore, makeElement, validateScene } from "./store";
import { CompanionServer } from "./server";
import { DrawingMcpServer } from "./mcp";
import type { BoardInfo, BoardStatus, BoardMode } from "../../src/types/board";
export const BOARD_CONTROL_TITLES = [
	"MistaRecorda Board Editor",
	"MistaRecorda Presenter",
	"MistaRecorda Board Hint",
	"MistaRecorda Board Stream",
];
let store: BoardStore;
let panel: BrowserWindow | undefined,
	editor: BrowserWindow | undefined,
	surface: BrowserWindow | undefined,
	hint: BrowserWindow | undefined,
	stream: BrowserWindow | undefined;
let companion: CompanionServer, mcp: DrawingMcpServer;
let displayId = 0;
let panelTab: BoardInfo["panelTab"] = "draw";
let edgeTimer: ReturnType<typeof setInterval> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const edgeTrigger = new EdgeBoardTrigger();
let closing = false;
let status: BoardStatus = { recording: false, paused: false, elapsed: 0, webcam: false };
const windows = () =>
	[panel, editor, surface, hint, stream].filter(
		(w): w is BrowserWindow => !!w && !w.isDestroyed(),
	);
function bounds() {
	return (screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay())
		.bounds;
}
function tabletInfo() {
	return { state: store.state, status };
}
function info(): BoardInfo {
	return {
		state: store.state,
		panelTab,
		status,
		displayId,
		displays: screen
			.getAllDisplays()
			.map((d) => ({ id: d.id, name: d.label || `Display ${d.id}` })),
		devices: companion.list(),
		pairing: companion.pairing(),
		mcp: mcp.server ? { url: mcp.url, token: mcp.token } : undefined,
	};
}
function send(event: string, data: unknown) {
	if (closing) return;
	for (const w of windows()) {
		if (!w.webContents.isDestroyed()) w.webContents.send(`board:${event}`, data);
	}
}
function publish(origin = "system") {
	send("state", { state: store.state, origin });
	companion.broadcast("state", { state: store.state, origin });
	send("info", info());
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		void store.save().catch((e) => send("error", String(e)));
	}, 180);
}
function devicesChanged() {
	send("info", info());
	send("devices", companion.list());
}
async function loadWindow(w: BrowserWindow, type: string) {
	const base =
		process.env.VITE_DEV_SERVER_URL ||
		getPackagedRendererBaseUrl() ||
		pathToFileURL(path.join(app.getAppPath(), "dist/index.html")).href;
	await w.loadURL(`${base}?windowType=${type}`);
}
function makeWindow(
	title: string,
	type: string,
	options: Electron.BrowserWindowConstructorOptions,
) {
	const win = new BrowserWindow({
		title,
		show: false,
		frame: false,
		transparent: true,
		backgroundColor: "#00000000",
		hasShadow: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		...options,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			backgroundThrottling: false,
		},
	});
	win.on("page-title-updated", (e) => e.preventDefault());
	win.webContents.on("did-finish-load", () => win.setTitle(title));
	win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	win.webContents.on("will-navigate", (e) => e.preventDefault());
	win.on("close", (e) => {
		if (!closing) {
			e.preventDefault();
			win.hide();
		}
	});
	win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	if (type !== "board-surface") win.setContentProtection(true);
	void loadWindow(win, type).catch((e) => send("error", String(e)));
	return win;
}
async function prepare() {
	if ([panel, surface, editor, hint, stream].every((w) => w && !w.isDestroyed())) return;
	// Rebuild a partial window set without touching saved drawing state.
	if (edgeTimer) clearInterval(edgeTimer);
	for (const w of windows()) w.destroy();
	displayId = screen.getAllDisplays().some((d) => d.id === displayId)
		? displayId
		: screen.getPrimaryDisplay().id;
	const b = bounds();
	store.state.width = b.width;
	store.state.height = b.height;
	surface = makeWindow("MistaRecorda Drawing Surface", "board-surface", {
		...b,
		focusable: false,
	});
	surface.setIgnoreMouseEvents(true);
	editor = makeWindow(BOARD_CONTROL_TITLES[0], "board-editor", { ...b });
	panel = makeWindow(BOARD_CONTROL_TITLES[1], "board-panel", {
		width: 440,
		height: Math.min(660, b.height - 70),
		x: b.x + b.width - 460,
		y: b.y + 35,
		resizable: true,
	});
	hint = makeWindow(BOARD_CONTROL_TITLES[2], "board-hint", {
		width: 36,
		height: 180,
		x: b.x,
		y: b.y + Math.round(b.height / 2) - 90,
		focusable: false,
	});
	hint.setIgnoreMouseEvents(false);
	stream = makeWindow(BOARD_CONTROL_TITLES[3], "board-stream", {
		width: 10,
		height: 10,
		focusable: false,
	});
	edgeTimer = setInterval(() => {
		if (closing || !hint || hint.isDestroyed()) return;
		const p = screen.getCursorScreenPoint(),
			b = bounds();
		const atEdge = p.x >= b.x && p.x <= b.x + 8 && p.y >= b.y + 24 && p.y < b.y + b.height - 24;
		const allowed =
			store.state.enabled &&
			store.state.mode === "screen" &&
			!(status.recording && process.platform === "linux");
		const visible = edgeTrigger.update(
			atEdge || (p.x >= b.x && p.x <= b.x + 36 && Math.abs(p.y - (b.y + b.height / 2)) < 90),
			allowed,
			Date.now(),
		);
		if (visible) hint?.showInactive();
		else hint?.hide();
	}, 80);
}
function disarm() {
	hint?.hide();
}

function applyVisibility() {
	if (!store.state.enabled) {
		surface?.hide();
		editor?.hide();
		disarm();
		return;
	}
	// Linux cannot guarantee exclusion, so keep controls out during recording.
	if (status.recording && process.platform === "linux") {
		panel?.hide();
		editor?.hide();
		hint?.hide();
	}
	// Keep the clean window registered with the OS even for transparent screen-only output.
	if (!surface?.isVisible()) surface?.showInactive();
}
function trusted(e: IpcMainInvokeEvent) {
	if (e.senderFrame !== e.sender.mainFrame || !BrowserWindow.fromWebContents(e.sender))
		return false;
	try {
		const u = new URL(e.senderFrame.url);
		u.search = "";
		u.hash = "";
		return [
			process.env.VITE_DEV_SERVER_URL,
			getPackagedRendererBaseUrl(),
			pathToFileURL(path.join(app.getAppPath(), "dist/index.html")).href,
		].some((b) => b && new URL(b).href === u.href);
	} catch {
		return false;
	}
}
const modeOf = (input: unknown): BoardMode => {
	const mode = typeof input === "string" ? input : (input as { mode?: unknown })?.mode;
	if (mode !== "screen" && mode !== "board") throw Error("Unknown board mode");
	return mode;
};
const commandSchema = z.object({
	tab: z.enum(["draw", "ipad", "scenes", "settings"]).optional(),
	mode: z.enum(["screen", "board"]).optional(),
	scene: z.unknown().optional(),
	revision: z.number().int().optional(),
	zoom: z.number().finite().optional(),
	scrollX: z.number().finite().optional(),
	scrollY: z.number().finite().optional(),
	confirmed: z.boolean().optional(),
	name: z.string().optional(),
	elements: z.array(z.record(z.unknown())).max(200).optional(),
	ids: z.array(z.string()).max(200).optional(),
	dataURL: z.string().optional(),
	x: z.number().finite().optional(),
	y: z.number().finite().optional(),
	width: z.number().finite().positive().optional(),
	height: z.number().finite().positive().optional(),
	deviceId: z.string().optional(),
	signal: z.unknown().optional(),
	type: z.string().optional(),
	sdp: z.string().optional(),
	candidate: z.unknown().optional(),
});
async function action(method: string, input: unknown, actor = "desktop"): Promise<unknown> {
	const data = commandSchema.parse(
		input && typeof input === "object" && !Array.isArray(input) ? input : {},
	);
	switch (method) {
		case "info":
			return info();
		case "tabletInfo":
			return tabletInfo();
		case "panelTab":
			panelTab = z.enum(["draw", "ipad", "scenes", "settings"]).parse(input);
			return info();
		case "togglePanel": {
			const tab = z.enum(["draw", "ipad", "scenes", "settings"]).parse(data.tab ?? "draw");
			await prepare();
			if (shouldHidePanel(panel?.isVisible() ?? false, panelTab ?? "draw", tab))
				panel?.hide();
			else {
				panelTab = tab;
				send("navigate", tab);
				if (panel) showCapturePanel(panel, BrowserWindow.getAllWindows());
			}
			return info();
		}
		case "open":
			if (data.tab) panelTab = data.tab;
			await prepare();
			if (data.tab) send("navigate", data.tab);
			if (panel) showCapturePanel(panel, BrowserWindow.getAllWindows());
			return info();
		case "enable":
			if (status.recording) throw Error("Enable drawing before starting a recording");
			await prepare();
			store.state.enabled = !!input;
			store.state.revision++;
			applyVisibility();
			publish(actor);
			return info();
		case "annotate":
			if (status.recording && !store.state.enabled)
				throw Error("Enable drawing on the Mac before starting this recording.");
			await prepare();
			if (!store.state.enabled) store.state.mode = "screen";
			store.state.enabled = true;
			if (store.state.output === "screen") store.state.output = "screen-board";
			store.state.revision++;
			applyVisibility();
			publish(actor);
			return store.state;
		case "edit":
			if (status.recording && !store.state.enabled)
				throw Error("Enable drawing before starting a recording");
			await prepare();
			store.state.enabled = true;
			applyVisibility();
			editor?.show();
			publish(actor);
			return true;
		case "compact":
			panel?.setSize(440, input ? 190 : Math.min(660, bounds().height - 70));
			return true;
		case "hideEditor":
			editor?.hide();
			return true;
		case "display":
			if (status.recording) throw Error("Stop recording before changing displays");
			if (!screen.getAllDisplays().some((d) => d.id === input))
				throw Error("Unknown display");
			displayId = Number(input);
			send("displayChanged", displayId);
			{
				const b = bounds();
				surface?.setBounds(b);
				editor?.setBounds(b);
				hint?.setPosition(b.x, b.y + Math.round(b.height / 2) - 90);
				store.state.width = b.width;
				store.state.height = b.height;
				store.state.revision++;
				publish(actor);
			}
			return info();
		case "toggleBoard":
			await prepare();
			await action(
				"mode",
				{ mode: store.state.mode === "board" ? "screen" : "board" },
				actor,
			);
			return info();
		case "mode": {
			if (status.recording && !store.state.enabled)
				throw Error("Enable drawing before starting a recording");
			await prepare();
			const previousMode = store.state.mode;
			store.state.mode = modeOf(input);
			if (store.state.mode === "board") {
				panel?.hide();
				if (actor.startsWith("desktop") || actor === "codex") editor?.show();
				else editor?.hide();
			} else if (previousMode === "board")
				setTimeout(() => {
					if (store.state.mode === "screen") editor?.hide();
				}, 460);
			if (store.state.mode === "screen" && store.state.output === "board")
				store.state.output = "screen-board";
			store.state.enabled = true;
			store.state.revision++;
			applyVisibility();
			publish(actor);
			return store.state;
		}
		case "output":
			if (input !== "screen" && input !== "screen-board" && input !== "board")
				throw Error("Invalid capture output");
			store.state.output = input;
			if (input === "board") store.state.mode = "board";
			store.state.revision++;
			applyVisibility();
			publish(actor);
			return store.state;
		case "scene":
			store.updateScene(modeOf(input), data.scene, data.revision ?? -1);
			publish(actor);
			return store.state;
		case "viewport": {
			const s = store.state.scenes[store.state.mode];
			store.state.scenes[store.state.mode] = validateScene({
				...s,
				zoom: data.zoom,
				scrollX: data.scrollX,
				scrollY: data.scrollY,
			});
			store.state.revision++;
			publish(actor);
			return store.state;
		}
		case "clear": {
			if (data.confirmed !== true) throw Error("Confirm clearing this scene");
			store.state.scenes[store.state.mode] = {
				...store.state.scenes[store.state.mode],
				elements: [],
				files: {},
			};
			store.state.revision++;
			publish(actor);
			return store.state;
		}
		case "library":
			if (!Array.isArray(input) || JSON.stringify(input).length > 8 * 1024 * 1024)
				throw Error("Invalid library");
			store.state.library = input;
			store.state.revision++;
			publish(actor);
			return true;
		case "saveScene":
			await store.saveScene(String(data.name ?? input));
			return true;
		case "loadScene":
			await store.loadScene(String(data.name ?? input));
			publish(actor);
			return store.state;
		case "listScenes":
			return store.listScenes();
		case "pair":
			await prepare();
			await companion.start();
			companion.renew();
			send("info", info());
			return info();
		case "approve":
			await companion.approve(String(input));
			return info();
		case "disconnect":
			companion.disconnect(String(input));
			return info();
		case "stopPairing":
			companion.stop();
			return info();
		case "mcp":
			await prepare();
			if (input) await mcp.start();
			else mcp.stop();
			send("info", info());
			return info();
		case "mcpGet":
			return { state: store.state, savedScenes: await store.listScenes() };
		case "draw":
		case "updateElements":
		case "deleteElements": {
			let elements = store.state.scenes[store.state.mode].elements;
			const incoming = data.elements ?? [];
			if (method === "draw") {
				const added = incoming.map(makeElement);
				if (added.some((e) => elements.some((v) => v.id === e.id)))
					throw Error("Object ID already exists");
				elements = [...elements, ...added];
			} else if (method === "deleteElements") {
				elements = elements.map((e) =>
					data.ids?.includes(e.id)
						? { ...e, isDeleted: true, version: e.version + 1 }
						: e,
				);
			} else {
				for (const v of incoming)
					if (!elements.some((e) => e.id === v.id))
						throw Error(`Object not found: ${v.id}`);
				elements = elements.map((e) => {
					const next = incoming.find((n) => n.id === e.id);
					return next
						? {
								...e,
								...next,
								id: e.id,
								type: e.type,
								version: e.version + 1,
								updated: Date.now(),
							}
						: e;
				});
			}
			store.state.scenes[store.state.mode] = validateScene({
				...store.state.scenes[store.state.mode],
				elements,
			});
			store.state.revision++;
			publish(actor);
			return store.state;
		}
		case "image": {
			const id = randomUUID();
			const s = store.state.scenes[store.state.mode];
			const mime = /^data:([^;]+);/.exec(data.dataURL ?? "")?.[1] ?? "";
			const e = {
				...makeElement({ type: "rectangle", ...data }),
				id: randomUUID(),
				type: "image",
				fileId: id,
				status: "saved",
				scale: [1, 1],
				crop: null,
			};
			store.state.scenes[store.state.mode] = validateScene({
				...s,
				elements: [...s.elements, e],
				files: {
					...s.files,
					[id]: { id, dataURL: data.dataURL ?? "", mimeType: mime, created: Date.now() },
				},
			});
			store.state.revision++;
			publish(actor);
			return store.state;
		}
		case "screenshot":
			if (!surface) await prepare();
			// Wait for the clean renderer to apply this exact scene, then for its paint.
			await surface!.webContents.executeJavaScript(`new Promise((resolve, reject) => {
                const started = Date.now();
                const check = () => {
                    if (Number(document.documentElement.dataset.boardRevision) >= ${store.state.revision}) {
                        requestAnimationFrame(() => requestAnimationFrame(resolve));
                    } else if (Date.now() - started > 8000) reject(new Error("Drawing surface is not ready"));
                    else setTimeout(check, 30);
                }; check();
            })`);
			return (await surface!.webContents.capturePage()).toPNG().toString("base64");
		case "cameraError":
			send("error", `Webcam could not start: ${input}`);
			return true;
		case "status":
			status = z
				.object({
					recording: z.boolean(),
					paused: z.boolean(),
					elapsed: z.number().nonnegative(),
					webcam: z.boolean(),
					webcamDeviceId: z.string().optional(),
					sourceId: z.string().optional(),
					sourceName: z.string().optional(),
				})
				.parse(input);
			send("status", status);
			companion.broadcast("status", status);
			applyVisibility();
			return true;
		case "control":
			if (!["record", "pause", "webcam", "webcam-on", "webcam-off"].includes(String(input)))
				throw Error("Unknown recording control");
			for (const w of BrowserWindow.getAllWindows())
				if (w.webContents.getURL().includes("windowType=hud-overlay"))
					w.webContents.send("board:control", input);
			return true;
		case "validateCapture":
			assertBoardCaptureSource(
				z
					.object({
						sourceType: z.string().optional(),
						display_id: z.string().optional(),
					})
					.parse(input),
			);
			return true;
		case "captureConfig":
			return { enabled: store.state.enabled };
		case "captureSource": {
			requireScreenRecordingAccess();
			const b =
				screen.getAllDisplays().find((d) => d.id === displayId) ??
				screen.getPrimaryDisplay();
			const sources = await desktopCapturer.getSources({
				types: ["screen"],
				thumbnailSize: { width: 0, height: 0 },
			});
			const source = sources.find((s) => s.display_id === String(b.id));
			if (!source) throw Error("Display unavailable. Check screen recording permission.");
			return source.id;
		}
		case "capturePreview": {
			if (!companion.list().some((device) => device.approved && device.connected))
				throw Error("No connected drawing companion");
			requireScreenRecordingAccess();
			const b = bounds();
			const sources = await desktopCapturer.getSources({
				types: ["screen"],
				thumbnailSize: { width: 1280, height: Math.round((1280 * b.height) / b.width) },
			});
			const source = sources.find((source) => source.display_id === String(displayId));
			if (!source || source.thumbnail.isEmpty()) throw Error("Screen preview unavailable");
			return `data:image/jpeg;base64,${source.thumbnail.toJPEG(75).toString("base64")}`;
		}
		case "signal":
			stream?.webContents.send("board:signal", { ...data, deviceId: actor });
			return true;
		case "signalToDevice":
			companion.send(data.deviceId ?? "", "signal", data.signal);
			return true;
		default:
			throw Error("Unknown board operation");
	}
}
export function boardCaptureExclusions() {
	return {
		ownerPID: process.pid,
		cleanSurfaceTitle: store?.state.enabled ? "MistaRecorda Drawing Surface" : undefined,
		cleanSurfaceWindowId:
			store?.state.enabled && surface && !surface.isDestroyed()
				? captureWindowId(surface.getMediaSourceId())
				: undefined,
		titles: BrowserWindow.getAllWindows()
			.filter((w) => w !== surface)
			.map((w) => w.getTitle()),
	};
}
export function assertBoardCaptureSource(source: { sourceType?: string; display_id?: string }) {
	if (store?.state.enabled && process.platform === "linux")
		throw Error(
			"Drawing-board recording is supported on macOS and Windows. Disable the drawing overlay to record on Linux.",
		);
	if (
		store?.state.enabled &&
		(source.sourceType === "window" || source.display_id !== String(displayId))
	)
		throw Error(
			"For drawing-board recording, select the same full display in the recorder and Drawing board panel.",
		);
	if (store?.state.enabled && process.platform === "win32")
		for (const w of BrowserWindow.getAllWindows())
			if (w !== surface) w.setContentProtection(true);
}
export async function registerBoard() {
	store = new BoardStore(path.join(app.getPath("userData"), "drawing-board"));
	await store.load().catch((e) => console.error("[drawing-board] Could not load saved board", e));
	companion = new CompanionServer(path.join(app.getAppPath(), "dist"), action, devicesChanged);
	mcp = new DrawingMcpServer((method, input) => action(method, input, "codex"));
	ipcMain.handle("board:request", async (e, method, input) => {
		if (!trusted(e)) throw Error("Untrusted board request");
		return action(method, input, `desktop:${e.sender.id}`);
	});
	// Drawing windows are created on demand, before enabling the overlay.
	displayId = screen.getPrimaryDisplay().id;
	for (const [key, control] of [
		["CommandOrControl+Shift+R", "record"],
		["CommandOrControl+Shift+P", "pause"],
	])
		globalShortcut.register(key, () => void action("control", control));
	globalShortcut.register(
		"CommandOrControl+Shift+B",
		() => void action("toggleBoard", undefined).catch((e) => send("error", String(e))),
	);
	globalShortcut.register("CommandOrControl+Shift+H", () => {
		const hud = BrowserWindow.getAllWindows().find((w) =>
			w.webContents.getURL().includes("windowType=hud-overlay"),
		);
		if (hud?.isVisible()) hud.hide();
		else hud?.showInactive();
	});
	app.on("before-quit", (event) => {
		if (closing) return;
		event.preventDefault();
		closing = true;
		if (edgeTimer) clearInterval(edgeTimer);
		if (saveTimer) clearTimeout(saveTimer);
		disarm();
		companion.stop();
		mcp.stop();
		void store
			.save()
			.catch((e) => console.error("Could not save board at exit", e))
			.finally(() => app.quit());
	});
}

// Native menus and global shortcuts use the same recording command path.
export function sendRecordingControl(
	control: "record" | "pause" | "webcam" | "webcam-on" | "webcam-off",
) {
	return action("control", control);
}

export function toggleDrawingBoard() {
	return action("toggleBoard", undefined).catch((e) => send("error", String(e)));
}

export function isBoardCaptureWebContents(contents: Electron.WebContents | null): boolean {
	return (
		!!contents &&
		((store?.state.enabled && surface?.webContents === contents) ||
			(stream?.webContents === contents &&
				companion?.list().some((d) => d.approved && d.connected)))
	);
}

export async function openDrawingStudio(tab: BoardInfo["panelTab"] = "draw") {
	return action("open", { tab });
}

export function isDrawingSurfaceWindow(win: BrowserWindow) {
	return win === surface && !win.isDestroyed();
}
export async function prepareBoardCapture() {
	await ensureDrawingSurfaceReady({
		enabled: () => Boolean(store?.state.enabled),
		prepare,
		show: () => {
			surface?.showInactive();
		},
		waitForCanvas: async () => {
			if (!surface || surface.isDestroyed())
				throw Error("Drawing window was closed during setup.");
			if (surface.webContents.isLoadingMainFrame())
				await new Promise<void>((resolve, reject) => {
					const web = surface!.webContents;
					const done = () => {
						clearTimeout(timeout);
						web.removeListener("did-finish-load", done);
						resolve();
					};
					const timeout = setTimeout(() => {
						web.removeListener("did-finish-load", done);
						reject(Error("Drawing window did not load."));
					}, 6000);
					web.once("did-finish-load", done);
				});
			await surface.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const start = Date.now();
    function ready() {
     if (document.querySelector('[data-board-ready="true"]')) requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
     else if (Date.now() - start > 6000) reject(new Error('Drawing canvas did not initialize.'));
     else setTimeout(ready,50);
    }
    ready();
   })`);
		},
		recover: async () => {
			if (!surface || surface.isDestroyed()) await prepare();
			else await loadWindow(surface, "board-surface");
		},
	});
}
