import { captureDisplayStill } from "../studio/livePreview";
import { studioCaptureWindowId } from "../studio/captureVisibility";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
	app,
	BrowserWindow,
	desktopCapturer,
	globalShortcut,
	type IpcMainInvokeEvent,
	ipcMain,
	nativeImage,
	safeStorage,
	screen,
} from "electron";
import OpenAI from "openai";
import { z } from "zod";
import type { BoardInfo, BoardMode, BoardStatus } from "../../src/types/board";
import { ChartStore } from "../charts/store";
import {
	assertChartIdsShowable,
	assertChartReveal,
	chartAction,
	restartRevealedCharts,
} from "../charts/actions";
import {
	addWhiteboardPage,
	activateWhiteboardPage,
	saveWhiteboardPage,
	whiteboardPages,
} from "../../src/components/board/whiteboards";
import { FigureService } from "../figures/service";
import { FigureSettings } from "../figures/settings";
import { publicURL } from "../figures/sources";
import { nativeCaptureProcess, selectedSource } from "../ipc/state";
import { shouldHidePanel, showCapturePanel } from "../panelToggle";
import { getPackagedRendererBaseUrl } from "../rendererServer";
import { requireScreenRecordingAccess } from "../screenCaptureAccess";
import { recorderCommand } from "../studio/nativeCommand";
import {
	presentChromeURL,
	endChromePresentation,
	chromePresentationState,
	boardSoundList,
	setSoundPreference,
	sceneMediaPlayback,
	getSceneMediaFile,
	boardSoundPreview,
	fireSound,
	updateBoardSound,
	exportPresentationSounds,
	preparePresentationSounds,
} from "../studio/register";
import {
	validatePresentationBundle,
	presentationName,
	fitPresentation,
} from "./presentationBundle";
import {
	isShadow,
	presentationMeta,
	preserveShadows,
	setShadow,
	shadowSelectionIds,
} from "../../src/components/board/shadowObjects";
import { stopStream, streamInfo } from "../studio/streamAudio";
import { recordingVoiceList, selectRecordingVoice } from "../studio/voiceCues";
import { captureWindowId, ensureDrawingSurfaceReady } from "./captureReady";
import { EdgeBoardTrigger } from "./edgeTrigger";
import { gifSize } from "./gifSize";
import { DrawingMcpServer } from "./mcp";
import { clearMemes, memeSchema, placeMeme, validateMemes } from "./memes";
import { seedDefaultMemes } from "./defaultMemes";
import { bundledMemeFromURL } from "../../src/lib/bundledMemes";
import { finishMemeTake, mergeMemeLibraries } from "../../src/components/board/memePreferences";
import { PresenterStore } from "./presenter";
import { CompanionPreview } from "./preview";
import { CompanionServer } from "./server";
import { BoardStore, makeElement, validateScene } from "./store";
export const BOARD_CONTROL_TITLES = [
	"MistaRecorda Board Editor",
	"MistaRecorda Presenter",
	"MistaRecorda Board Hint",
	"MistaRecorda Board Stream",
];
let store: BoardStore;
let presenter: PresenterStore;
let charts: ChartStore;
let figures: FigureService;
let preview: CompanionPreview;
let escapeReady = false;
let lastEscape = 0;
let panel: BrowserWindow | undefined,
	editor: BrowserWindow | undefined,
	surface: BrowserWindow | undefined,
	hint: BrowserWindow | undefined,
	stream: BrowserWindow | undefined;
let companion: CompanionServer, mcp: DrawingMcpServer;
let displayId = 0;
let panelTab: BoardInfo["panelTab"] = "draw";
let pendingPresenterTool: "ai" | "voices" | "sounds" | "memes" | null = null;
let edgeTimer: ReturnType<typeof setInterval> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const edgeTrigger = new EdgeBoardTrigger();
let closing = false;
let status: BoardStatus = { recording: false, paused: false, elapsed: 0, webcam: false };
let loadingPresentation = false;
let drawingSync = Promise.resolve();
function syncDrawingCapture() {
	if (
		process.platform !== "darwin" ||
		!nativeCaptureProcess ||
		!selectedSource?.id?.startsWith("window:") ||
		!surface ||
		surface.isDestroyed()
	)
		return;
	const id = captureWindowId(surface.getMediaSourceId());
	if (!id) return;
	const captureProcess = nativeCaptureProcess;
	const mode = store.state.mode;
	drawingSync = drawingSync
		.catch(() => undefined)
		.then(async () => {
			// A board first opened during a take may still be loading/painting.
			// Do not let ScreenCaptureKit snapshot its provisional window geometry.
			await prepareBoardCapture();
			if (nativeCaptureProcess !== captureProcess) return;
			return recorderCommand(`drawing ${id} ${mode}`, "DRAWING_READY", "DRAWING_FAILED");
		});
	void drawingSync.catch((e) =>
		send("error", `Could not include the whiteboard in the recording: ${e.message}`),
	);
}
function canEnableDrawingDuringCapture() {
	return (
		process.platform === "darwin" &&
		!!nativeCaptureProcess &&
		selectedSource?.id?.startsWith("window:")
	);
}
const windows = () =>
	[panel, editor, surface, hint, stream].filter(
		(w): w is BrowserWindow => !!w && !w.isDestroyed(),
	);
function bounds() {
	return (screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay())
		.bounds;
}
function editorWorkArea() {
	const display =
		screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay();
	return {
		left: display.workArea.x - display.bounds.x,
		top: display.workArea.y - display.bounds.y,
		width: display.workArea.width,
		height: display.workArea.height,
	};
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
	updateEscape();
	send("state", { state: store.state, origin });
	companion.broadcast("state", { state: store.state, origin });
	send("info", info());
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		void store.save().catch((e) => send("error", String(e)));
	}, 180);
}
function devicesChanged() {
	preview?.retain(
		companion
			.list()
			.filter((d) => d.approved && d.connected)
			.map((d) => d.id),
	);
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
	// Keep the app-wide navigation policy so trusted setup links open externally.
	// The drawing window itself must never navigate away from its canvas.
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
		// Frameless canvases must use the full display origin. Otherwise macOS
		// pushes them below the menu bar while the iPad preview starts at y=0.
		enableLargerThanScreen: true,
		focusable: false,
	});
	surface.setBounds(b);
	surface.setIgnoreMouseEvents(true);
	editor = makeWindow(BOARD_CONTROL_TITLES[0], "board-editor", {
		...b,
		enableLargerThanScreen: true,
	});
	editor.setBounds(b);
	editor.on("show", () => editor?.webContents.send("board:toolbarReset", editorWorkArea()));
	editor.on("resize", () => editor?.webContents.send("board:toolbarBounds", editorWorkArea()));
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
	whiteboardId: z
		.string()
		.regex(/^[a-zA-Z0-9_-]{1,100}$/)
		.optional(),
	tab: z.enum(["draw", "ipad", "scenes", "settings"]).optional(),
	mode: z.enum(["screen", "board"]).optional(),
	scene: z.unknown().optional(),
	revision: z.number().int().optional(),
	tag: z.string().max(100).optional(),
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
	shadow: z.boolean().optional(),
	note: z.boolean().optional(),
	enter: z.enum(["none", "fade", "spin", "fall"]).optional(),
	deviceId: z.string().optional(),
	signal: z.unknown().optional(),
	type: z.string().optional(),
	sdp: z.string().optional(),
	candidate: z.unknown().optional(),
});
async function action(method: string, input: unknown, actor = "desktop"): Promise<unknown> {
	if (
		loadingPresentation &&
		![
			"info",
			"tabletInfo",
			"presenterInfo",
			"mcpGet",
			"exportPresentation",
			"savePresentation",
			"listPresentations",
		].includes(method)
	)
		throw Error("An environment is loading. Try again in a moment.");
	const data = commandSchema.parse(
		input && typeof input === "object" && !Array.isArray(input) ? input : {},
	);
	switch (method) {
		case "info":
			return info();
		case "editorWorkArea":
			return editorWorkArea();
		case "tabletInfo":
			return tabletInfo();
		case "openPresenter": {
			const tool = z.enum(["ai", "voices", "sounds"]).parse(input);
			pendingPresenterTool = tool;
			await openDrawingStudio("draw");
			panel?.webContents.send("board:openPresenter", tool);
			return info();
		}
		case "takePresenterTool": {
			const tool = pendingPresenterTool;
			pendingPresenterTool = null;
			return tool;
		}
		case "openMemes":
			pendingPresenterTool = "memes";
			await openDrawingStudio("draw");
			panel?.webContents.send("board:openPresenter", "memes");
			return info();
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
			if (input && store.state.output === "screen") store.state.output = "screen-board";
			store.state.revision++;
			applyVisibility();
			publish(actor);
			return info();
		case "annotate":
			if (status.recording && !store.state.enabled && !canEnableDrawingDuringCapture())
				throw Error("Enable drawing on the Mac before starting this recording.");
			await prepare();
			if (!store.state.enabled) store.state.mode = "screen";
			store.state.enabled = true;
			if (store.state.output === "screen") store.state.output = "screen-board";
			store.state.revision++;
			applyVisibility();
			publish(actor);
			syncDrawingCapture();
			return store.state;
		case "edit":
			if (status.recording && !store.state.enabled && !canEnableDrawingDuringCapture())
				throw Error("Enable drawing before starting a recording");
			await prepare();
			store.state.enabled = true;
			applyVisibility();
			editor?.show();
			publish(actor);
			syncDrawingCapture();
			return true;
		case "compact":
			panel?.setSize(440, input ? 190 : Math.min(660, bounds().height - 70));
			return true;
		case "hideEditor":
			editor?.hide();
			return true;
		case "escape":
			if (store.state.mode === "board") return action("mode", { mode: "screen" }, actor);
			return action("clear", { confirmed: true }, actor);
		case "display":
			if (status.recording) throw Error("Stop recording before changing displays");
			if (!screen.getAllDisplays().some((d) => d.id === input))
				throw Error("Unknown display");
			preview.stop();
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
				{ mode: store.state.enabled && store.state.mode === "board" ? "screen" : "board" },
				actor,
			);
			return info();
		case "createWhiteboard": {
			const id = randomUUID();
			addWhiteboardPage(store.state, id);
			store.state.revision++;
			publish(actor);
			return { id, state: store.state };
		}
		case "renameWhiteboard": {
			const name = z.string().trim().min(1).max(80).parse(data.name);
			const pages = whiteboardPages(store.state);
			const page = pages.find((p) => p.id === data.whiteboardId);
			if (!page) throw Error("Unknown whiteboard");
			page.name = name;
			store.state.whiteboards = pages;
			store.state.revision++;
			publish(actor);
			return store.state;
		}
		case "activateWhiteboard": {
			if (status.recording && !store.state.enabled && !canEnableDrawingDuringCapture())
				throw Error("Enable drawing before starting a recording");
			await prepare();
			activateWhiteboardPage(store.state, data.whiteboardId ?? "");
			return action("mode", { mode: "board" }, actor);
		}
		case "clearWhiteboard": {
			if (data.confirmed !== true) throw Error("Confirm clearing this whiteboard");
			const page = whiteboardPages(store.state).find((p) => p.id === data.whiteboardId);
			if (!page) throw Error("Unknown whiteboard");
			saveWhiteboardPage(
				store.state,
				page.id,
				{ ...page.scene, elements: [], files: {} },
				[],
			);
			store.state.revision++;
			if (page.id === (store.state.activeWhiteboardId ?? "default"))
				send("sceneReset", store.state);
			companion.broadcast("whiteboardReset", { id: page.id, state: store.state });
			publish(actor);
			return store.state;
		}
		case "mode": {
			if (status.recording && !store.state.enabled && !canEnableDrawingDuringCapture())
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
			syncDrawingCapture();
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
		case "scene": {
			const mode = modeOf(input);
			const incoming = validateScene(data.scene);
			const whiteboardId =
				mode === "board"
					? (data.whiteboardId ?? store.state.activeWhiteboardId ?? "default")
					: undefined;
			if (actor.startsWith("desktop"))
				incoming.elements = preserveShadows(
					incoming.elements,
					mode === "board"
						? (whiteboardPages(store.state).find((page) => page.id === whiteboardId)
								?.scene.elements ?? [])
						: store.state.scenes.screen.elements,
				);
			assertChartReveal(
				charts,
				mode === "board"
					? (whiteboardPages(store.state).find((page) => page.id === whiteboardId)?.scene
							.elements ?? [])
					: store.state.scenes.screen.elements,
				incoming.elements,
			);
			if (
				mode === "board" &&
				whiteboardId !== (store.state.activeWhiteboardId ?? "default")
			) {
				if (data.revision !== store.state.revision)
					throw Error("The board changed. Refresh and retry your edit.");
				const page = whiteboardPages(store.state).find((p) => p.id === whiteboardId);
				if (!page) throw Error("Unknown whiteboard");
				const merged = validateScene({
					...incoming,
					files: { ...page.scene.files, ...incoming.files },
				});
				const assets = store.mergeAssets(incoming.files);
				saveWhiteboardPage(store.state, whiteboardId!, merged);
				store.state.assets = assets;
				store.state.revision++;
			} else store.updateScene(mode, incoming, data.revision ?? -1, true);
			const patch = {
				mode,
				scene: incoming,
				revision: store.state.revision,
				tag: data.tag,
				whiteboardId,
			};
			send("sceneUpdate", patch);
			companion.broadcast("sceneUpdate", patch);
			updateEscape();
			if (saveTimer) clearTimeout(saveTimer);
			saveTimer = setTimeout(
				() => void store.save().catch((e) => send("error", String(e))),
				180,
			);
			return { revision: store.state.revision };
		}
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
			clearMemes(store.state, store.state.mode);
			store.state.scenes[store.state.mode] = {
				...store.state.scenes[store.state.mode],
				elements: [],
				files: {},
			};
			store.state.revision++;
			send("sceneReset", store.state);
			companion.broadcast("sceneReset", store.state);
			publish(actor);
			companion.broadcast("refreshPreview", { revision: store.state.revision });
			return store.state;
		}
		case "aiInfo":
			return figures.info();
		case "aiSetKey":
			return figures.setKey(input);
		case "aiTestKey":
			return figures.testKey();
		case "aiCleanup":
			return figures.retryCleanup();
		case "aiSearch":
			return figures.search(z.string().trim().min(1).max(2000).parse(input));
		case "aiGenerate": {
			const request = z
				.object({ id: z.string().max(50), prompt: z.string().min(1).max(2000) })
				.parse(input);
			return figures.generate(request.id, request.prompt);
		}
		case "aiListen": {
			await prepare();
			await figures.listen();
			if (stream?.webContents.isLoading())
				await new Promise<void>((resolve) =>
					stream!.webContents.once("did-finish-load", () => resolve()),
				);
			stream?.webContents.send("board:figureMic", "start");
			return figures.info();
		}
		case "aiStopListening":
			stream?.webContents.send("board:figureMic", "stop");
			return figures.info();
		case "aiCancel":
			stream?.webContents.send("board:figureMic", "cancel");
			return figures.cancel();
		case "aiMicError":
			figures.fail(z.string().max(300).parse(input));
			return true;
		case "aiAudio":
			return figures.transcribe(
				z
					.object({
						data: z
							.string()
							.max(4 * 1024 * 1024)
							.regex(/^[A-Za-z0-9+/=]+$/),
						mime: z.literal("audio/webm"),
					})
					.parse(input),
			);
		case "aiOpen":
			await presentChromeURL(publicURL(figures.result(z.string().parse(input)).url).href);
			return true;
		case "presenterInfo":
			return presenter.state;
		case "saveTalkingNotes":
		case "savePresenterLink":
		case "removePresenterLink":
		case "saveObjectPreference": {
			const next = await presenter.update(method, input);
			// Notes and object settings never enter the recorded scene or bump its revision.
			companion.broadcast("presenterChanged", next);
			return next;
		}
		case "saveCanvasNote": {
			const next = await presenter.update(method, input);
			companion.broadcast("presenterChanged", next);
			return next;
		}
		case "setObjectShadow": {
			const request = z
				.object({
					mode: z.enum(["screen", "board"]),
					ids: z.array(z.string()).min(1).max(200),
					shadow: z.boolean(),
					enter: z.enum(["none", "fade", "spin", "fall"]).optional(),
					revision: z.number().int(),
				})
				.parse(input);
			if (request.revision !== store.state.revision)
				throw Error("The scene changed. Select the object and try again.");
			const scene = store.state.scenes[request.mode];
			const ids = shadowSelectionIds(scene.elements, request.ids);
			if (!request.shadow) {
				assertChartIdsShowable(charts, scene.elements, ids);
				restartRevealedCharts(charts, scene.elements, ids);
			}
			const changedAt = Date.now();
			const refs = [
				...new Map(
					scene.elements
						.filter((e) => ids.has(e.id) && isShadow(e))
						.map((e) => presentationMeta(e)?.reference)
						.filter(Boolean)
						.map((ref) => [`${ref!.kind}:${ref!.id}`, ref] as const),
				).values(),
			];
			store.updateScene(
				request.mode,
				{
					...scene,
					elements: scene.elements.map((e) =>
						ids.has(e.id) ? setShadow(e, request.shadow, request.enter, changedAt) : e,
					),
				},
				request.revision,
			);
			// Link/sound cue cards stay private; revealing activates their action instead.
			if (!request.shadow)
				for (const ref of refs)
					if (ref?.kind === "sound" || ref?.kind === "link") {
						store.state.scenes[request.mode].elements = store.state.scenes[
							request.mode
						].elements.map((e) =>
							ids.has(e.id) && presentationMeta(e)?.reference?.id === ref.id
								? setShadow(e, true)
								: e,
						);
					}
			publish(actor);
			if (!request.shadow)
				for (const ref of refs) {
					if (ref?.kind === "sound") await fireSound(ref.id);
					if (ref?.kind === "link")
						await action("openPresenterLink", { id: ref.id }, actor);
				}
			return store.state;
		}
		case "setMemeShadow": {
			const request = z
				.object({
					id: z.string().uuid(),
					mode: z.enum(["screen", "board"]),
					shadow: z.boolean(),
				})
				.parse(input);
			const item = store.state.placedMemes?.[request.mode].find((m) => m.id === request.id);
			if (!item) throw Error("Meme no longer exists.");
			const revealing = item.shadow && !request.shadow;
			item.shadow = request.shadow;
			item.removedAt = undefined;
			if (revealing) item.placedAt = Date.now();
			store.state.revision++;
			publish(actor);
			const sound = store.state.memes?.find((m) => m.id === item.assetId)?.soundId;
			if (revealing && sound) await fireSound(sound);
			return store.state;
		}
		case "exportPresentation":
			return validatePresentationBundle({
				format: "mistarecorda-presentation",
				version: 1,
				name: String(data.name || "Presentation"),
				board: store.state,
				presenter: presenter.state,
				sounds: await exportPresentationSounds(),
				charts: await charts.exportBundle(),
			});
		case "savePresentation": {
			const name = presentationName(data.name);
			const bundle = await action("exportPresentation", { name }, actor);
			await fs.mkdir(path.join(store.root, "presentations"), { recursive: true });
			const temporary = path.join(store.root, "presentations", `${randomUUID()}.tmp`);
			await fs.writeFile(temporary, JSON.stringify(bundle), { mode: 0o600 });
			await fs.rename(temporary, path.join(store.root, "presentations", `${name}.json`));
			return { name };
		}
		case "listPresentations":
			return (await fs.readdir(path.join(store.root, "presentations")).catch(() => []))
				.filter((f) => f.endsWith(".json"))
				.map((f) => f.slice(0, -5));
		case "loadPresentation": {
			const name = presentationName(data.name);
			return action(
				"importPresentation",
				{
					bundle: JSON.parse(
						await fs.readFile(
							path.join(store.root, "presentations", `${name}.json`),
							"utf8",
						),
					),
					confirmed: data.confirmed,
				},
				actor,
			);
		}
		case "importPresentation": {
			if (status.recording) throw Error("Stop recording before loading an environment.");
			const request = z
				.object({ bundle: z.unknown(), confirmed: z.literal(true) })
				.parse(input);
			const bundle = validatePresentationBundle(request.bundle);
			fitPresentation(bundle.board, store.state.width, store.state.height);
			loadingPresentation = true;
			try {
				await action("savePresentation", { name: "Before last import" }, actor);
				const previous = structuredClone(store.state),
					oldPresenter = structuredClone(presenter.state);
				const sounds = await preparePresentationSounds(bundle.sounds);
				let oldCharts: Awaited<ReturnType<ChartStore["exportBundle"]>> | undefined;
				try {
					for (const m of bundle.board.memes ?? [])
						if (m.soundId) m.soundId = sounds.mapping[m.soundId] ?? "";
					for (const ref of Object.values(bundle.presenter.notes.references))
						if (ref.kind === "sound") ref.id = sounds.mapping[ref.id] ?? ref.id;
					for (const scene of [
						...Object.values(bundle.board.scenes),
						...(bundle.board.whiteboards ?? [])
							.filter((p) => p.id !== bundle.board.activeWhiteboardId)
							.map((p) => p.scene),
					])
						for (const e of scene.elements) {
							const ref = presentationMeta(e)?.reference;
							if (ref?.kind === "sound") ref.id = sounds.mapping[ref.id] ?? ref.id;
						}
					const preferences = bundle.presenter.preferences;
					for (const [oldId, id] of Object.entries(sounds.mapping))
						if (id !== oldId && preferences[`sound:${oldId}`]) {
							preferences[`sound:${id}`] = preferences[`sound:${oldId}`];
							delete preferences[`sound:${oldId}`];
						}
					if (status.recording)
						throw Error("Recording started. Stop it before loading an environment.");
					store.state = {
						...store.state,
						...bundle.board,
						...validateMemes({
							...store.state,
							...bundle.board,
							memes: mergeMemeLibraries(
								store.state.memes ?? [],
								bundle.board.memes ?? [],
							),
						}),
						width: store.state.width,
						height: store.state.height,
						revision: store.state.revision + 1,
					};
					if (bundle.charts?.charts.length) {
						// Imported charts replace same-ID charts; other saved charts are kept.
						const current = await charts.exportBundle();
						const ids = new Set(bundle.charts.charts.map((c) => c.id));
						oldCharts = await charts.replace({
							charts: [
								...current.charts.filter((c) => !ids.has(c.id)),
								...bundle.charts.charts,
							],
							sources: { ...current.sources, ...bundle.charts.sources },
						});
					}
					await store.save();
					await presenter.update("replacePresentation", bundle.presenter);
					await sounds.commit();
				} catch (error) {
					store.state = previous;
					const restored = await Promise.allSettled([
						store.save(),
						presenter.update("replacePresentation", oldPresenter),
						sounds.rollback(),
						oldCharts ? charts.replace(oldCharts) : Promise.resolve(),
					]);
					send("sceneReset", store.state);
					companion.broadcast("sceneReset", store.state);
					companion.broadcast("presenterChanged", presenter.state);
					publish(actor);
					if (restored.some((r) => r.status === "rejected"))
						throw Object.assign(
							new Error(
								"Import could not be saved. Your backup is saved as Before last import; check available disk space before loading it.",
							),
							{ cause: error },
						);
					throw error;
				}
				send("sceneReset", store.state);
				companion.broadcast("sceneReset", store.state);
				companion.broadcast("presenterChanged", presenter.state);
				publish(actor);
				return { state: store.state, presenter: presenter.state, name: bundle.name };
			} finally {
				loadingPresentation = false;
			}
		}
		case "urlPresentation":
			return chromePresentationState() ?? null;
		case "endURLPresentation":
			await endChromePresentation();
			return true;
		case "openPresenterLink":
			await presentChromeURL(presenter.link(input));
			if (store.state.enabled && store.state.mode === "board")
				await action("mode", { mode: "screen" }, actor);
			return true;
		case "updatePresenterSound":
			return updateBoardSound(input);
		case "importPresenterImage": {
			const data = z
				.object({
					name: z.string().trim().min(1).max(80),
					dataURL: z
						.string()
						.max(16 * 1024 * 1024)
						.regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
				})
				.parse(input);
			const image = nativeImage.createFromDataURL(data.dataURL);
			if (image.isEmpty()) throw Error("Choose a valid PNG, JPEG or WebP image.");
			const id = randomUUID();
			store.state.assets = store.mergeAssets({
				[id]: {
					id,
					name: data.name,
					dataURL: data.dataURL,
					mimeType: data.dataURL.slice(5, data.dataURL.indexOf(";")),
					created: Date.now(),
				},
			});
			store.state.revision++;
			publish(actor);
			return store.state;
		}
		case "aiImport":
		case "aiImportGenerated": {
			if (status.recording && !store.state.enabled)
				throw Error("Enable drawing before recording to import a visual.");
			const buffer =
				method === "aiImport"
					? await figures.image(z.string().parse(input))
					: Buffer.from(figures.state.preview?.dataURL.split(",")[1] ?? "", "base64");
			if (buffer.length > 12 * 1024 * 1024) throw Error("Image exceeds 12 MB.");
			const image = nativeImage.createFromBuffer(buffer);
			if (image.isEmpty()) throw Error("No valid image to import.");
			const size = image.getSize(),
				width = Math.min(store.state.width * 0.75, size.width),
				height = (width * size.height) / size.width;
			await action("mode", { mode: "board" }, actor);
			return action(
				"image",
				{
					dataURL: image.toDataURL(),
					x: (store.state.width - width) / 2,
					y: 60,
					width,
					height,
					name:
						method === "aiImportGenerated"
							? "AI-generated illustration"
							: figures.result(String(input)).title,
				},
				actor,
			);
		}
		case "sceneMedia": {
			const playback = await sceneMediaPlayback();
			if (companion.devices.has(actor))
				playback.sources = playback.sources.map((s) => ({
					...s,
					url: companion.sceneMediaUrl(s.id, actor),
				}));
			return playback;
		}
		case "setSoundPreference":
			await setSoundPreference(input);
			return boardSoundList();
		case "chartInfo":
		case "chartSource":
		case "chartCreate":
		case "chartUpdate":
		case "chartRemove":
		case "chartPlayback":
		case "chartAnalyze":
		case "chartCancel":
		case "chartPlace":
			return chartAction(method, input, actor, {
				charts,
				board: store,
				publish,
				hasKey: () => figures.settings.hasKey(),
				validImage: (dataURL) => !nativeImage.createFromDataURL(dataURL).isEmpty(),
			});
		case "chartCapture": {
			// A still for cropping only: nothing is placed. Presenter windows are excluded by content protection.
			await prepare();
			requireScreenRecordingAccess();
			const b = bounds();
			const sources = await desktopCapturer.getSources({
				types: ["screen"],
				thumbnailSize: { width: 2560, height: Math.round((2560 * b.height) / b.width) },
			});
			const source = sources.find((s) => s.display_id === String(displayId));
			if (!source || source.thumbnail.isEmpty())
				throw Error("Could not capture this display.");
			const still = preview.lastFrame
				? nativeImage.createFromDataURL(preview.lastFrame)
				: source.thumbnail;
			const jpeg = still.toJPEG(90);
			return {
				dataURL: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
				name: `Screen ${new Date().toLocaleTimeString()}`,
			};
		}
		case "aiChartSource": {
			const id = z.string().max(50).parse(input);
			const result = figures.result(id);
			const buffer = await figures.image(id);
			if (buffer.length > 12 * 1024 * 1024) throw Error("Image exceeds 12 MB.");
			const image = nativeImage.createFromBuffer(buffer);
			if (image.isEmpty()) throw Error("No valid image to import.");
			return {
				dataURL: `data:image/png;base64,${image.toPNG().toString("base64")}`,
				source: {
					url: publicURL(result.url).href,
					publisher: result.source.slice(0, 120),
					notes: result.summary.slice(0, 1000),
				},
				title: result.title,
			};
		}
		case "soundboard":
			return boardSoundList();
		case "streamInfo":
			return streamInfo();
		case "streamStop":
			return stopStream();
		case "recordingVoices":
			return recordingVoiceList(input === true);
		case "selectRecordingVoice":
			return selectRecordingVoice(z.string().max(100).parse(input));
		case "armMeme": {
			const id = z.string().uuid().parse(input);
			const asset = store.state.memes?.find((m) => m.id === id);
			if (!asset) throw Error("Meme not found.");
			await action("edit", undefined, actor);
			panel?.hide();
			send("memePlacement", asset);
			return true;
		}
		case "restoreDefaultMemes": {
			if (status.recording) throw Error("Stop recording before restoring default memes.");
			const previous = store.state;
			const previousRevision = previous.revision;
			const next = await seedDefaultMemes(previous, defaultMemeAssets(), true);
			if (store.state !== previous || store.state.revision !== previousRevision)
				throw Error("The board changed. Please try again.");
			store.state = next;
			store.state.revision++;
			publish(actor);
			return store.state;
		}
		case "setMemePreference": {
			const request = z
				.object({
					id: z.string().uuid(),
					kind: z.enum(["love", "favorite"]),
					value: z.boolean(),
				})
				.parse(input);
			const meme = store.state.memes?.find((m) => m.id === request.id);
			if (!meme) throw Error("Meme no longer exists.");
			if (request.kind === "love") meme.loved = request.value;
			else {
				const favorites = new Set(store.state.favoriteMemeIds ?? []);
				if (request.value) favorites.add(meme.id);
				else favorites.delete(meme.id);
				store.state.favoriteMemeIds = [...favorites];
			}
			store.state.revision++;
			publish(actor);
			return store.state;
		}
		case "saveMeme": {
			const meme = memeSchema.parse(input);
			meme.loved = store.state.memes?.find((m) => m.id === meme.id)?.loved ?? false;
			const size =
				bundledMemeFromURL(meme.dataURL) ??
				(meme.dataURL.startsWith("data:image/gif;")
					? gifSize(Buffer.from(meme.dataURL.split(",")[1], "base64"))
					: nativeImage.createFromDataURL(meme.dataURL).getSize());
			if (!size.width || !size.height) throw Error("Choose a valid image or GIF.");
			const next = {
				...store.state,
				memes: [
					...(store.state.memes ?? []).filter((m) => m.id !== meme.id),
					{ ...meme, width: size.width, height: size.height },
				],
			};
			Object.assign(store.state, validateMemes(next));
			store.state.revision++;
			publish(actor);
			return store.state;
		}
		case "deleteMeme": {
			const id = z.string().uuid().parse(input);
			store.state.memes = (store.state.memes ?? []).filter((m) => m.id !== id);
			store.state.favoriteMemeIds = (store.state.favoriteMemeIds ?? []).filter(
				(m) => m !== id,
			);
			for (const mode of ["screen", "board"] as const)
				if (store.state.placedMemes)
					store.state.placedMemes[mode] = store.state.placedMemes[mode].filter(
						(m) => m.assetId !== id,
					);
			store.state.revision++;
			publish(actor);
			return store.state;
		}
		case "placeMeme": {
			if (!store.state.enabled) throw Error("Enable drawing before placing a meme.");
			const sound = placeMeme(store.state, input);
			store.state.revision++;
			publish(actor);
			if (sound)
				await fireSound(sound).catch((e) =>
					send("error", `Meme placed, but its sound could not play: ${String(e)}`),
				);
			return store.state;
		}
		case "removeMeme": {
			const id = z.string().uuid().parse(input);
			const item = store.state.placedMemes?.[store.state.mode].find((m) => m.id === id);
			if (item) item.removedAt ??= Date.now();
			store.state.revision++;
			publish(actor);
			return store.state;
		}
		case "laser": {
			const point = z
				.object({
					x: z.number().finite().min(-1e7).max(1e7),
					y: z.number().finite().min(-1e7).max(1e7),
					mode: z.enum(["screen", "board"]),
				})
				.parse(input);
			if (store.state.enabled && point.mode === store.state.mode) send("laser", point);
			return true;
		}
		case "playSound":
			await fireSound(z.string().uuid().parse(input));
			return boardSoundList();
		case "previewSound":
			return boardSoundPreview(z.string().uuid().parse(input));
		case "captureStill": {
			if (status.recording && !store.state.enabled)
				throw Error("Enable drawing before recording to place a still on the whiteboard.");
			await prepare();
			requireScreenRecordingAccess();
			const b = bounds();
			const sources = await desktopCapturer.getSources({
				types: ["screen"],
				thumbnailSize: { width: 2560, height: Math.round((2560 * b.height) / b.width) },
			});
			const source = sources.find((s) => s.display_id === String(displayId));
			if (!source || source.thumbnail.isEmpty())
				throw Error("Could not capture this display.");
			const id = randomUUID();
			const file = {
				id,
				dataURL:
					process.platform === "darwin"
						? nativeImage
								.createFromDataURL(
									await captureDisplayStill(displayId, studioCaptureWindowId()),
								)
								.toDataURL()
						: source.thumbnail.toDataURL(),
				mimeType: "image/png",
				created: Date.now(),
				name: `Screen still ${new Date().toLocaleTimeString()}`,
			};
			const scene = store.state.scenes.board;
			const width = store.state.width * 0.8,
				height = store.state.height * 0.8;
			const element = {
				...makeElement({
					type: "rectangle",
					x: (store.state.width - width) / 2,
					y: (store.state.height - height) / 2,
					width,
					height,
				}),
				type: "image",
				fileId: id,
				status: "saved",
				scale: [1, 1],
				crop: null,
			};
			store.updateScene(
				"board",
				{
					...scene,
					scrollX: 0,
					scrollY: 0,
					zoom: 1,
					elements: [...scene.elements, element],
					files: { ...scene.files, [id]: file },
				},
				store.state.revision,
			);
			await action("mode", { mode: "board" }, actor);
			companion.broadcast("refreshPreview", { revision: store.state.revision });
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
			return {
				state: store.state,
				savedScenes: await store.listScenes(),
				presenter: presenter.state,
				charts: (await charts.info()).charts,
			};
		case "draw":
		case "updateElements":
		case "deleteElements": {
			const mode = data.mode ?? store.state.mode;
			let elements = store.state.scenes[mode].elements;
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
			const next = validateScene({
				...store.state.scenes[mode],
				elements,
			});
			assertChartReveal(charts, store.state.scenes[mode].elements, next.elements);
			store.state.scenes[mode] = next;
			store.state.revision++;
			publish(actor);
			return store.state;
		}
		case "image": {
			const mode = data.mode ?? store.state.mode;
			const id = randomUUID();
			const s = store.state.scenes[mode];
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
			store.updateScene(
				mode,
				{
					...s,
					elements: [...s.elements, e],
					files: {
						...s.files,
						[id]: {
							id,
							dataURL: data.dataURL ?? "",
							mimeType: mime,
							created: Date.now(),
							name:
								typeof data.name === "string" ? data.name.slice(0, 160) : undefined,
						},
					},
				},
				store.state.revision,
			);
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
		case "status": {
			const wasRecording = status.recording;
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
			// Pausing the recording freezes chart reveals so the take resumes on the same frame.
			if (status.paused || (wasRecording && !status.recording)) charts.pauseAll();
			if (finishMemeTake(store.state, wasRecording, status.recording)) {
				store.state.revision++;
				publish();
			}
			send("status", status);
			companion.broadcast("status", status);
			applyVisibility();
			return true;
		}
		case "control":
			if (
				![
					"record",
					"pause",
					"webcam",
					"webcam-on",
					"webcam-off",
					"microphone-on",
					"microphone-off",
					"system-audio-on",
					"system-audio-off",
					"recording-defaults",
				].includes(String(input))
			)
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
			if (
				process.platform === "darwin" &&
				["request", "fallback"].includes(data.type ?? "")
			) {
				requireScreenRecordingAccess();
				preview.start(actor, displayId);
				return true;
			}
			stream?.webContents.send("board:signal", { ...data, deviceId: actor });
			return true;
		case "signalToDevice":
			companion.send(data.deviceId ?? "", "signal", data.signal);
			return true;
		default:
			throw Error("Unknown board operation");
	}
}
export function refreshCompanionCapture() {
	preview?.restart();
}
export function boardCaptureExclusions() {
	return {
		ownerPID: process.pid,
		cleanSurfaceTitle: store?.state.enabled ? "MistaRecorda Drawing Surface" : undefined,
		drawingMode: store?.state.mode,
		cleanSurfaceWindowId:
			store?.state.enabled && surface && !surface.isDestroyed()
				? captureWindowId(surface.getMediaSourceId())
				: undefined,
		titles: BrowserWindow.getAllWindows()
			.filter((w) => w !== surface)
			.map((w) => w.getTitle()),
	};
}
/** The full display that drawing-board recording must capture. */
export function boardDisplayId() {
	return displayId;
}
export function assertBoardCaptureSource(source: { sourceType?: string; display_id?: string }) {
	if (store?.state.enabled && process.platform === "linux")
		throw Error(
			"Drawing-board recording is supported on macOS and Windows. Disable the drawing overlay to record on Linux.",
		);
	if (
		store?.state.enabled &&
		!(process.platform === "darwin" && source.sourceType === "window") &&
		(source.sourceType === "window" || source.display_id !== String(displayId))
	)
		throw Error(
			"For drawing-board recording, select the same full display in the recorder and Drawing board panel.",
		);
	if (store?.state.enabled && process.platform === "win32")
		for (const w of BrowserWindow.getAllWindows())
			if (w !== surface) w.setContentProtection(true);
}
const defaultMemeAssets = () =>
	path.join(app.getAppPath(), app.isPackaged ? "dist" : "public", "assets/memes/starter-v1");
export async function registerBoard() {
	store = new BoardStore(path.join(app.getPath("userData"), "drawing-board"));
	presenter = new PresenterStore(store.root);
	await presenter.load().catch((e) => console.error("[presenter] Could not load notes", e));
	figures = new FigureService(
		new FigureSettings(path.join(app.getPath("userData"), "figures"), safeStorage),
		(state) => {
			send("figures", state);
			companion?.broadcast("figures", state);
			if (state.phase !== "listening") stream?.webContents.send("board:figureMic", "cancel");
		},
		() => store.state.memes ?? [],
	);
	try {
		await store.load();
		// Keep saved screen/whiteboard objects until the presenter explicitly clears them.
		const next = await seedDefaultMemes(store.state, defaultMemeAssets());
		if (next !== store.state) {
			store.state = next;
			await store.save();
		}
	} catch (e) {
		console.error("[drawing-board] Could not load saved board or default memes", e);
	}
	charts = new ChartStore(
		store.root,
		{
			charts: (info) => {
				send("charts", info);
				companion?.broadcast("charts", info);
			},
			playback: (p) => {
				send("chartPlayback", p);
				companion?.broadcast("chartPlayback", p);
			},
		},
		async () =>
			new OpenAI({ apiKey: await figures.settings.key(), maxRetries: 0, timeout: 120000 }),
		() => figures.settings.hasKey(),
	);
	await charts.load().catch((e) => console.error("[charts] Could not load charts", e));
	companion = new CompanionServer(
		path.join(app.getAppPath(), "dist"),
		action,
		devicesChanged,
		getSceneMediaFile,
	);
	preview = new CompanionPreview((id, data) => companion.send(id, "signal", data));
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
		if (hud?.isMinimized()) {
			hud.restore();
			hud.show();
			hud.focus();
		} else if (hud?.isVisible()) hud.hide();
		else {
			hud?.show();
			hud?.focus();
		}
	});
	app.on("before-quit", (event) => {
		if (closing) return;
		event.preventDefault();
		closing = true;
		if (edgeTimer) clearInterval(edgeTimer);
		if (saveTimer) clearTimeout(saveTimer);
		disarm();
		preview.stop();
		globalShortcut.unregister("Escape");
		companion.stop();
		mcp.stop();
		void Promise.all([store.save(), figures.cancel()])
			.catch((e) => console.error("Could not save board at exit", e))
			.finally(() => app.quit());
	});
}

// Native menus and global shortcuts use the same recording command path.
export function sendRecordingControl(
	control:
		| "record"
		| "pause"
		| "webcam"
		| "webcam-on"
		| "webcam-off"
		| "microphone-on"
		| "microphone-off"
		| "system-audio-on"
		| "system-audio-off"
		| "recording-defaults",
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

export function isFigureMicrophoneWebContents(contents: Electron.WebContents | null) {
	return !!contents && stream?.webContents === contents && figures?.state.phase === "listening";
}

function updateEscape() {
	const active =
		store.state.enabled &&
		(store.state.mode === "board" ||
			store.state.scenes.screen.elements.some((e) => !e.isDeleted) ||
			store.state.placedMemes?.screen.some(
				(m) =>
					!m.removedAt &&
					(m.stayUntilClicked || m.placedAt + m.durationSeconds * 1000 > Date.now()),
			));
	if (active && !escapeReady)
		escapeReady = globalShortcut.register("Escape", () => {
			if (Date.now() - lastEscape < 600) return;
			lastEscape = Date.now();
			void action("escape", undefined).catch((e) => send("error", String(e)));
		});
	else if (!active && escapeReady) {
		globalShortcut.unregister("Escape");
		escapeReady = false;
	}
}

/** Scene media shares the clean capture surface, including single-window recordings. */
export async function enableSceneMediaSurface() {
	await action("annotate", undefined);
}
