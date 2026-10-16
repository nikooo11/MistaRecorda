import { studioIsShownInCapture } from "./studio/captureVisibility";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";
import { USER_DATA_PATH } from "./appPaths";
import { recordingStudioBounds } from "./recordingStudioBounds";
import { getPackagedRendererBaseUrl } from "./rendererServer";

const electronWindowsDir = path.dirname(fileURLToPath(import.meta.url));
const nodeRequire = createRequire(import.meta.url);

const APP_ROOT = path.join(electronWindowsDir, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST = path.join(APP_ROOT, "dist");
const WINDOW_ICON_FILENAME = "mistarecorda-512.png";
const WINDOW_ICON_PATH = path.join(
	process.env.VITE_PUBLIC || RENDERER_DIST,
	"app-icons",
	WINDOW_ICON_FILENAME,
);

let hudOverlayWindow: BrowserWindow | null = null;
let quittingStudio = false;
app.on("before-quit", () => {
	quittingStudio = true;
});
let countdownWindow: BrowserWindow | null = null;
let updateToastWindow: BrowserWindow | null = null;

const STUDIO_BOUNDS_FILE = path.join(USER_DATA_PATH, "recording-studio-window.json");
const HUD_EDGE_MARGIN_DIP = 16;
const UPDATE_TOAST_WIDTH = 456;
const UPDATE_TOAST_HEIGHT = 252;
const UPDATE_TOAST_GAP_DIP = 18;

function getEditorWindowQuery(): Record<string, string> {
	const query: Record<string, string> = {
		windowType: "editor",
	};

	if (process.env.RECORDLY_DEV_OPEN_RECORDING_INPUT) {
		query.devOpenInput = process.env.RECORDLY_DEV_OPEN_RECORDING_INPUT;
	}
	if (process.env.RECORDLY_DEV_OPEN_RECORDING_WEBCAM) {
		query.devOpenWebcam = process.env.RECORDLY_DEV_OPEN_RECORDING_WEBCAM;
	}

	if (process.env.RECORDLY_SMOKE_EXPORT === "1") {
		query.smokeExport = "1";
		if (process.env.RECORDLY_SMOKE_EXPORT_INPUT) {
			query.smokeInput = process.env.RECORDLY_SMOKE_EXPORT_INPUT;
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_OUTPUT) {
			query.smokeOutput = process.env.RECORDLY_SMOKE_EXPORT_OUTPUT;
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_USE_NATIVE === "1") {
			query.smokeUseNativeExport = "1";
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_ENCODING_MODE) {
			query.smokeEncodingMode = process.env.RECORDLY_SMOKE_EXPORT_ENCODING_MODE;
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_SHADOW_INTENSITY) {
			query.smokeShadowIntensity = process.env.RECORDLY_SMOKE_EXPORT_SHADOW_INTENSITY;
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_WEBCAM_INPUT) {
			query.smokeWebcamInput = process.env.RECORDLY_SMOKE_EXPORT_WEBCAM_INPUT;
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_WEBCAM_SHADOW) {
			query.smokeWebcamShadow = process.env.RECORDLY_SMOKE_EXPORT_WEBCAM_SHADOW;
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_WEBCAM_SIZE) {
			query.smokeWebcamSize = process.env.RECORDLY_SMOKE_EXPORT_WEBCAM_SIZE;
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_PIPELINE) {
			query.smokePipelineModel = process.env.RECORDLY_SMOKE_EXPORT_PIPELINE;
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_BACKEND) {
			query.smokeBackendPreference = process.env.RECORDLY_SMOKE_EXPORT_BACKEND;
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_RENDER_BACKEND) {
			query.smokeRenderBackend = process.env.RECORDLY_SMOKE_EXPORT_RENDER_BACKEND;
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_MAX_ENCODE_QUEUE) {
			query.smokeMaxEncodeQueue = process.env.RECORDLY_SMOKE_EXPORT_MAX_ENCODE_QUEUE;
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_MAX_DECODE_QUEUE) {
			query.smokeMaxDecodeQueue = process.env.RECORDLY_SMOKE_EXPORT_MAX_DECODE_QUEUE;
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_MAX_PENDING_FRAMES) {
			query.smokeMaxPendingFrames = process.env.RECORDLY_SMOKE_EXPORT_MAX_PENDING_FRAMES;
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_PROJECT) {
			query.smokeProject = process.env.RECORDLY_SMOKE_EXPORT_PROJECT;
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_QUALITY) {
			query.smokeQuality = process.env.RECORDLY_SMOKE_EXPORT_QUALITY;
		}
		if (process.env.RECORDLY_SMOKE_EXPORT_FPS) {
			query.smokeFps = process.env.RECORDLY_SMOKE_EXPORT_FPS;
		}
	}

	return query;
}

// The recorder is now a normal, persistent window. Legacy HUD IPC remains
// compatible, but never enables click-through or expands invisible hit regions.
export function isHudOverlayMousePassthroughSupported(): boolean {
	return false;
}
function getScreen() {
	return nodeRequire("electron").screen as typeof import("electron").screen;
}
function getHudOverlayBounds() {
	const current = getHudOverlayWindow()?.getNormalBounds();
	let saved = current;
	if (!saved) {
		try {
			saved = JSON.parse(fs.readFileSync(STUDIO_BOUNDS_FILE, "utf8"));
		} catch {
			/* default placement */
		}
	}
	const screen = getScreen();
	const display =
		saved && [saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)
			? screen.getDisplayMatching(saved)
			: screen.getPrimaryDisplay();
	return recordingStudioBounds(display.workArea, saved);
}
function applyHudOverlayBounds() {
	const win = getHudOverlayWindow();
	if (win && !win.isMaximized() && !win.isFullScreen())
		win.setBounds(getHudOverlayBounds(), false);
	positionUpdateToastWindow();
}
function getUpdateToastBounds() {
	const win = getHudOverlayWindow();
	const area = win
		? getScreen().getDisplayMatching(win.getBounds()).workArea
		: getScreen().getPrimaryDisplay().workArea;
	const bounds = win?.getBounds() ?? area;
	return {
		x: Math.round(bounds.x + (bounds.width - UPDATE_TOAST_WIDTH) / 2),
		y: Math.max(
			area.y + HUD_EDGE_MARGIN_DIP,
			bounds.y - UPDATE_TOAST_HEIGHT - UPDATE_TOAST_GAP_DIP,
		),
		width: UPDATE_TOAST_WIDTH,
		height: UPDATE_TOAST_HEIGHT,
	};
}
function positionUpdateToastWindow() {
	if (updateToastWindow && !updateToastWindow.isDestroyed())
		updateToastWindow.setBounds(getUpdateToastBounds(), false);
}
const ignoreLegacyHudOverlayMessage = () => {
	// The normal studio window no longer needs the old transparent HUD hit regions.
};
ipcMain.on("hud-overlay-interactive-regions", ignoreLegacyHudOverlayMessage);
ipcMain.on("hud-overlay-set-ignore-mouse", ignoreLegacyHudOverlayMessage);
ipcMain.on("hud-overlay-set-source-selection-active", ignoreLegacyHudOverlayMessage);
ipcMain.on("hud-overlay-set-webcam-preview-visible", ignoreLegacyHudOverlayMessage);
ipcMain.on("hud-overlay-hide", () => getHudOverlayWindow()?.minimize());
ipcMain.handle("get-hud-overlay-capture-protection", () => ({ success: true, enabled: true }));
ipcMain.handle("set-hud-overlay-capture-protection", () => ({ success: true, enabled: true }));
ipcMain.handle("get-hud-overlay-mouse-passthrough-supported", () => ({
	success: true,
	supported: false,
}));

export function createHudOverlayWindow(): BrowserWindow {
	if (getHudOverlayWindow()) return getHudOverlayWindow()!;
	const win = new BrowserWindow({
		title: "MistaRecorda — Recording studio",
		...getHudOverlayBounds(),
		minWidth: 820,
		minHeight: 600,
		backgroundColor: "#28292d",
		resizable: true,
		minimizable: true,
		maximizable: true,
		show: false,
		hasShadow: true,
		...(process.platform === "darwin"
			? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 14, y: 14 } }
			: {}),
		webPreferences: {
			preload: path.join(electronWindowsDir, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true,
			webSecurity: false,
			backgroundThrottling: false,
		},
	});
	hudOverlayWindow = win;
	if (process.platform !== "linux") win.setContentProtection(!studioIsShownInCapture());
	let shown = false;
	const show = () => {
		if (!shown && !win.isDestroyed()) {
			shown = true;
			win.show();
		}
	};
	const ready = (event: Electron.IpcMainEvent) => {
		if (event.sender === win.webContents) show();
	};
	ipcMain.on("hud-overlay-renderer-ready", ready);
	win.once("ready-to-show", () => setTimeout(show, 500));
	win.webContents.on("did-finish-load", () => setTimeout(show, 1800));
	const persist = () => {
		if (win.isDestroyed() || win.isMinimized()) return;
		try {
			fs.writeFileSync(STUDIO_BOUNDS_FILE, JSON.stringify(win.getNormalBounds()));
		} catch {
			/* keep runtime placement */
		}
	};
	win.on("resize", persist);
	win.on("moved", persist);
	win.on("close", (event) => {
		if (!quittingStudio) {
			event.preventDefault();
			win.hide();
		}
	});
	const screen = getScreen();
	screen.on("display-removed", applyHudOverlayBounds);
	screen.on("display-metrics-changed", applyHudOverlayBounds);
	win.on("closed", () => {
		ipcMain.removeListener("hud-overlay-renderer-ready", ready);
		screen.removeListener("display-removed", applyHudOverlayBounds);
		screen.removeListener("display-metrics-changed", applyHudOverlayBounds);
		if (hudOverlayWindow === win) hudOverlayWindow = null;
	});
	if (VITE_DEV_SERVER_URL) void win.loadURL(VITE_DEV_SERVER_URL + "?windowType=hud-overlay");
	else
		void win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "hud-overlay" },
		});
	return win;
}
export function getHudOverlayWindow(): BrowserWindow | null {
	return hudOverlayWindow && !hudOverlayWindow.isDestroyed() ? hudOverlayWindow : null;
}
export function reassertHudOverlayMousePassthrough(): void {
	/* normal window */
}
export function setHudOverlayRecordingActive(_recording: boolean): void {
	/* keep geometry and recorder alive */
}

export function createUpdateToastWindow(): BrowserWindow {
	const initialBounds = getUpdateToastBounds();
	const parentWindow =
		process.platform === "darwin" && hudOverlayWindow && !hudOverlayWindow.isDestroyed()
			? hudOverlayWindow
			: undefined;
	const useTransparentToastWindow = process.platform !== "win32";

	const win = new BrowserWindow({
		width: initialBounds.width,
		height: initialBounds.height,
		x: initialBounds.x,
		y: initialBounds.y,
		frame: false,
		transparent: useTransparentToastWindow,
		resizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		show: false,
		focusable: true,
		...(parentWindow ? { parent: parentWindow } : {}),
		backgroundColor: useTransparentToastWindow ? "#00000000" : "#101418",
		webPreferences: {
			preload: path.join(electronWindowsDir, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});

	if (process.platform === "darwin") {
		win.setAlwaysOnTop(true, "status");
	}

	win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	updateToastWindow = win;

	win.on("closed", () => {
		if (updateToastWindow === win) {
			updateToastWindow = null;
		}
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=update-toast");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "update-toast" },
		});
	}

	return win;
}

export function getUpdateToastWindow(): BrowserWindow | null {
	return updateToastWindow && !updateToastWindow.isDestroyed() ? updateToastWindow : null;
}

export function showUpdateToastWindow(): BrowserWindow {
	const win = getUpdateToastWindow() ?? createUpdateToastWindow();
	positionUpdateToastWindow();
	if (!win.isVisible()) {
		if (process.platform === "win32") {
			win.show();
			win.moveTop();
		} else {
			win.showInactive();
		}
	} else {
		win.moveTop();
	}

	return win;
}

export function hideUpdateToastWindow(): void {
	if (!updateToastWindow || updateToastWindow.isDestroyed()) {
		return;
	}

	updateToastWindow.hide();
}

function loadPackagedEditorWindow(win: BrowserWindow) {
	const query = getEditorWindowQuery();
	const queryString = new URLSearchParams(query).toString();
	const indexHtmlPath = path.join(RENDERER_DIST, "index.html");
	const packagedRendererBaseUrl = getPackagedRendererBaseUrl();
	const webContents = win.webContents;

	const loadFromFile = () => {
		if (win.isDestroyed()) {
			return;
		}

		console.log("[editor-window] load-file", indexHtmlPath);
		void win.loadFile(indexHtmlPath, { query });
	};

	if (!packagedRendererBaseUrl) {
		loadFromFile();
		return;
	}

	const targetUrl = `${packagedRendererBaseUrl}/?${queryString}`;
	let settled = false;
	let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
		fallbackToFile("load-timeout");
	}, 5000);

	const clearTimeoutIfNeeded = () => {
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	const detachLoadListeners = () => {
		clearTimeoutIfNeeded();
		if (webContents.isDestroyed()) {
			return;
		}

		webContents.removeListener("did-fail-load", handleDidFailLoad);
		webContents.removeListener("did-finish-load", handleDidFinishLoad);
	};

	const fallbackToFile = (reason: string, details?: Record<string, unknown>) => {
		if (settled || win.isDestroyed()) {
			return;
		}

		settled = true;
		detachLoadListeners();
		console.warn("[editor-window] packaged renderer URL failed, falling back to file", {
			reason,
			targetUrl,
			...details,
		});
		loadFromFile();
	};

	const handleDidFailLoad = (
		_event: Electron.Event,
		errorCode: number,
		errorDescription: string,
		validatedURL: string,
		isMainFrame: boolean,
	) => {
		if (!isMainFrame || validatedURL !== targetUrl) {
			return;
		}

		fallbackToFile("did-fail-load", {
			errorCode,
			errorDescription,
			validatedURL,
		});
	};

	const handleDidFinishLoad = () => {
		if (webContents.getURL() !== targetUrl) {
			return;
		}

		settled = true;
		detachLoadListeners();
	};

	webContents.on("did-fail-load", handleDidFailLoad);
	webContents.on("did-finish-load", handleDidFinishLoad);
	win.once("closed", clearTimeoutIfNeeded);

	console.log("[editor-window] load-url", targetUrl);
	void win.loadURL(targetUrl).catch((error) => {
		fallbackToFile("load-url-rejected", {
			error: error instanceof Error ? error.message : String(error),
		});
	});
}

export function createEditorWindow(): BrowserWindow {
	const perfStart = Date.now();
	console.log("[PERF:MAIN] createEditorWindow: STARTED");
	const isMac = process.platform === "darwin";
	const { workArea, workAreaSize } = getScreen().getPrimaryDisplay();
	const initialWidth = isMac ? Math.round(workAreaSize.width * 0.85) : workArea.width;
	const initialHeight = isMac ? Math.round(workAreaSize.height * 0.85) : workArea.height;

	const win = new BrowserWindow({
		width: initialWidth,
		height: initialHeight,
		...(!isMac && {
			x: workArea.x,
			y: workArea.y,
		}),
		minWidth: 800,
		minHeight: 600,
		...(process.platform !== "darwin" && {
			icon: WINDOW_ICON_PATH,
		}),
		...(isMac && {
			titleBarStyle: "hiddenInset",
			trafficLightPosition: { x: 12, y: 12 },
		}),
		autoHideMenuBar: !isMac,
		transparent: false,
		resizable: true,
		alwaysOnTop: false,
		skipTaskbar: false,
		title: "MistaRecorda — based on Recordly",
		show: false,
		backgroundColor: "#000000",
		webPreferences: {
			preload: path.join(electronWindowsDir, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true,
			webSecurity: false,
			backgroundThrottling: false,
		},
	});

	if (process.env.RECORDLY_SMOKE_EXPORT === "1") {
		win.webContents.on("console-message", (details) =>
			console.log(`[smoke-renderer] ${details.message}`),
		);
		win.webContents.on("preload-error", (_event, _file, error) =>
			console.error("[smoke-preload]", error),
		);
	}

	win.once("ready-to-show", () => {
		console.log(`[PERF:MAIN] Editor Window: ready-to-show in ${Date.now() - perfStart}ms`);
		win.show();
	});

	win.webContents.on("did-finish-load", () => {
		console.log(`[PERF:MAIN] Editor Window: did-finish-load in ${Date.now() - perfStart}ms`);
		win?.webContents.send("main-process-message", new Date().toLocaleString());
		// Fallback for Linux/Wayland where `ready-to-show` may not fire reliably.
		if (!win.isDestroyed() && !win.isVisible()) {
			console.log("[editor-window] forcing show after did-finish-load");
			win.show();
		}
	});

	win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
		console.error("[editor-window] did-fail-load", {
			errorCode,
			errorDescription,
			validatedURL,
		});
	});

	win.webContents.on("render-process-gone", (_event, details) => {
		console.error("[editor-window] render-process-gone", details);
	});

	win.on("show", () => {
		console.log("[editor-window] show");
	});

	win.on("focus", () => {
		console.log("[editor-window] focus");
	});

	if (VITE_DEV_SERVER_URL) {
		const query = new URLSearchParams(getEditorWindowQuery());
		win.loadURL(`${VITE_DEV_SERVER_URL}?${query.toString()}`);
	} else {
		loadPackagedEditorWindow(win);
	}

	return win;
}

export function createSourceSelectorWindow(): BrowserWindow {
	const { width, height } = getScreen().getPrimaryDisplay().workAreaSize;

	const win = new BrowserWindow({
		width: 620,
		height: 420,
		minHeight: 350,
		maxHeight: 500,
		x: Math.round((width - 620) / 2),
		y: Math.round((height - 420) / 2),
		frame: false,
		resizable: false,
		alwaysOnTop: true,
		transparent: true,
		show: false,
		...(process.platform !== "darwin" && {
			icon: WINDOW_ICON_PATH,
		}),
		backgroundColor: "#00000000",
		webPreferences: {
			preload: path.join(electronWindowsDir, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	win.webContents.on("did-finish-load", () => {
		setTimeout(() => {
			if (!win.isDestroyed()) {
				win.show();
			}
		}, 100);
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=source-selector");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "source-selector" },
		});
	}

	return win;
}

export function createCountdownWindow(): BrowserWindow {
	const primaryDisplay = getScreen().getPrimaryDisplay();
	const { width, height } = primaryDisplay.workAreaSize;

	const windowSize = 200;
	const x = Math.floor((width - windowSize) / 2);
	const y = Math.floor((height - windowSize) / 2);

	const win = new BrowserWindow({
		width: windowSize,
		height: windowSize,
		x: x,
		y: y,
		frame: false,
		transparent: true,
		resizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		focusable: true,
		show: false,
		webPreferences: {
			preload: path.join(electronWindowsDir, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	countdownWindow = win;

	win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

	win.webContents.on("did-finish-load", () => {
		if (!win.isDestroyed()) {
			if (process.platform === "win32") {
				win.showInactive();
				win.moveTop();
			} else {
				win.show();
			}
		}
	});

	win.on("closed", () => {
		if (countdownWindow === win) {
			countdownWindow = null;
		}
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=countdown");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "countdown" },
		});
	}

	return win;
}

export function getCountdownWindow(): BrowserWindow | null {
	return countdownWindow;
}

export function closeCountdownWindow(): void {
	if (countdownWindow && !countdownWindow.isDestroyed()) {
		countdownWindow.close();
		countdownWindow = null;
	}
}
