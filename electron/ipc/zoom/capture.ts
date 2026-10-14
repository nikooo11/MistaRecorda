import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { app, BrowserWindow, screen } from "electron";
import type { HookMouseEvent } from "../types";
import {
	defaultRecordingZoomSettings,
	type RecordingZoomStatus,
} from "../../../src/types/recordingZoom";
import { HeldZoomCapture, canShowZoomOutline, validateZoomSettings } from "./model";

export const ZOOM_OVERLAY_TITLE = "MistaRecorda Zoom Target";
let settings = { ...defaultRecordingZoomSettings };
let capture = new HeldZoomCapture();
let recording = false;
let hookReady = false;
let pressed = false;
let pendingRelease = false;
let nativeMacExcluded = false;
let savedPath: string | null = null;
let outline: BrowserWindow | null = null;
let outlineTimer: ReturnType<typeof setInterval> | undefined;
let getBounds: (() => Electron.Rectangle | null) | undefined;
let getCursor = () => screen.getCursorScreenPoint();
const keyCodes: Record<string, number> = Object.fromEntries([
	...Object.entries({
		A: 30,
		B: 48,
		C: 46,
		D: 32,
		E: 18,
		F: 33,
		G: 34,
		H: 35,
		I: 23,
		J: 36,
		K: 37,
		L: 38,
		M: 50,
		N: 49,
		O: 24,
		P: 25,
		Q: 16,
		R: 19,
		S: 31,
		T: 20,
		U: 22,
		V: 47,
		W: 17,
		X: 45,
		Y: 21,
		Z: 44,
	}),
	...Array.from({ length: 10 }, (_, i) => [`F${i + 1}`, 59 + i] as const),
	["F11", 87],
	["F12", 88],
]);
export function zoomStatus(): RecordingZoomStatus {
	return {
		settings,
		recording,
		holding: Boolean(capture.active),
		following: capture.active?.mode === "auto",
		count: capture.regions.length,
		hookReady,
		outlineAvailable: canShowZoomOutline(process.platform, os.release(), nativeMacExcluded),
	};
}
function notify() {
	for (const win of BrowserWindow.getAllWindows())
		if (!win.isDestroyed() && win !== outline)
			win.webContents.send("recording-zoom:status", zoomStatus());
}
export async function loadZoomSettings() {
	try {
		settings = validateZoomSettings(
			JSON.parse(
				await fs.readFile(
					path.join(app.getPath("userData"), "recording-zoom.json"),
					"utf8",
				),
			),
		);
	} catch {
		/* Use defaults. */
	}
}
export async function saveZoomSettings(value: unknown) {
	if (recording) throw new Error("recordingActive");
	const next = validateZoomSettings(value);
	const file = path.join(app.getPath("userData"), "recording-zoom.json");
	await fs.mkdir(path.dirname(file), { recursive: true });
	const tmp = `${file}.${crypto.randomUUID()}.tmp`;
	try {
		await fs.writeFile(tmp, JSON.stringify(next), { mode: 0o600 });
		await fs.rename(tmp, file);
	} finally {
		await fs.rm(tmp, { force: true });
	}
	settings = next;
	notify();
}
export async function prepareZoomOutline() {
	nativeMacExcluded = false;
	if (outline && !outline.isDestroyed()) {
		outline.hide();
		return;
	}
	outline = new BrowserWindow({
		title: ZOOM_OVERLAY_TITLE,
		width: 200,
		height: 120,
		frame: false,
		transparent: true,
		backgroundColor: "#00000000",
		resizable: false,
		hasShadow: false,
		focusable: false,
		skipTaskbar: true,
		alwaysOnTop: true,
		show: false,
		webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
	});
	outline.setIgnoreMouseEvents(true);
	// macOS uses explicit ScreenCaptureKit exclusion; sharing flags alone are insufficient.
	if (process.platform === "win32") outline.setContentProtection(true);
	outline.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	outline.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	outline.webContents.on("will-navigate", (e) => e.preventDefault());
	await outline.loadURL(
		`data:text/html;charset=utf-8,${encodeURIComponent(`<html><head><title>${ZOOM_OVERLAY_TITLE}</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}body{box-sizing:border-box;border:2px solid #2dd4bf;border-radius:8px;box-shadow:inset 0 0 0 1px #042f2e88}</style></head><body></body></html>`)}`,
	);
}
export function confirmMacZoomExclusion(confirmed: boolean) {
	nativeMacExcluded = confirmed;
	notify();
}
function hideOutline() {
	if (outline && !outline.isDestroyed()) outline.hide();
}
function updateOutline() {
	if (!capture.active || !zoomStatus().outlineAvailable || !outline || outline.isDestroyed()) {
		hideOutline();
		return;
	}
	const bounds = getBounds?.();
	if (!bounds) {
		hideOutline();
		return;
	}
	const point = getCursor();
	const target = capture.target({
		cx: (point.x - bounds.x) / bounds.width,
		cy: (point.y - bounds.y) / bounds.height,
	});
	if (!target) return;
	outline.setBounds({
		x: Math.round(bounds.x + target.x * bounds.width),
		y: Math.round(bounds.y + target.y * bounds.height),
		width: Math.max(2, Math.round(bounds.width * target.width)),
		height: Math.max(2, Math.round(bounds.height * target.height)),
	});
	outline.showInactive();
}
export function startZoomCapture(
	bounds: () => Electron.Rectangle | null,
	cursor = () => screen.getCursorScreenPoint(),
) {
	capture = new HeldZoomCapture();
	recording = true;
	pressed = false;
	pendingRelease = false;
	hookReady = false;
	savedPath = null;
	getBounds = bounds;
	getCursor = cursor;
	clearInterval(outlineTimer);
	outlineTimer = setInterval(updateOutline, 1000 / 30);
	notify();
}
export function setZoomHookReady(ready: boolean) {
	hookReady = ready;
	notify();
}
export function closeHeldZoom(timeMs: number) {
	pendingRelease = false;
	capture.release(timeMs);
	hideOutline();
	notify();
}
export function stopZoomCapture(timeMs: number) {
	closeHeldZoom(timeMs);
	recording = false;
	pressed = false;
	clearInterval(outlineTimer);
	notify();
}
export function zoomKeyEvent(
	down: boolean,
	event: HookMouseEvent,
	timeMs: number,
	paused: boolean,
	cursor?: { x: number; y: number },
) {
	if (event.keycode !== keyCodes[settings.key]) return;
	if (!down) {
		pressed = false;
		if (pendingRelease && recording && !paused) capture.releaseKey(timeMs);
		pendingRelease = false;
		updateOutline();
		notify();
		return;
	}
	if (pressed) return;
	pressed = true;
	if (
		!recording ||
		paused ||
		!settings.enabled ||
		Boolean(event.ctrlKey) !== settings.ctrl ||
		Boolean(event.altKey) !== settings.alt ||
		Boolean(event.shiftKey) !== settings.shift ||
		Boolean(event.metaKey) !== settings.meta
	)
		return;
	// End a latched zoom even if the cursor has left the recorded display/window.
	// Its key-up must not start another zoom, nor may OS key-repeat restart it.
	if (capture.active?.mode === "manual") {
		closeHeldZoom(timeMs);
		return;
	}
	const bounds = getBounds?.();
	const point = cursor ?? screen.getCursorScreenPoint();
	if (
		!bounds ||
		point.x < bounds.x ||
		point.y < bounds.y ||
		point.x >= bounds.x + bounds.width ||
		point.y >= bounds.y + bounds.height
	)
		return;
	capture.press(
		timeMs,
		{ cx: (point.x - bounds.x) / bounds.width, cy: (point.y - bounds.y) / bounds.height },
		settings.depth,
	);
	pendingRelease = Boolean(capture.active);
	updateOutline();
	notify();
}
export async function persistRecordedZooms(videoPath: string) {
	if (!capture.regions.length || (savedPath && savedPath !== videoPath)) return;
	savedPath = videoPath;
	const target = `${videoPath}.zooms.json`;
	const tmp = `${target}.${crypto.randomUUID()}.tmp`;
	try {
		await fs.writeFile(tmp, JSON.stringify({ version: 1, regions: capture.regions }));
		await fs.rename(tmp, target);
	} finally {
		await fs.rm(tmp, { force: true });
	}
}
