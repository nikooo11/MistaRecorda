import { app, BrowserWindow, screen } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { verticalRect, captureRectSchema, type VerticalInfo } from "../../src/types/vertical";
import {
	currentProjectPath,
	isCursorCaptureActive,
	nativeScreenRecordingActive,
	selectedSource,
} from "../ipc/state";
import { protectAppWindow } from "./captureVisibility";
import { getPackagedRendererBaseUrl } from "../rendererServer";
export const VERTICAL_GUIDE_TITLE = "MistaRecorda Vertical Guide";
let dragUntil = 0;
let value: VerticalInfo | undefined;
let guide: BrowserWindow | undefined;
let pointer: ReturnType<typeof setInterval> | undefined;
let key = "new-recording";
const listeners = new Set<() => void>();
export function onVerticalChanged(fn: () => void) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}
export function verticalInfo(): VerticalInfo {
	const display =
		screen.getAllDisplays().find((d) => d.id === Number(selectedSource?.display_id)) ??
		screen.getPrimaryDisplay();
	return (
		value ?? {
			enabled: false,
			available: process.platform === "darwin",
			displayId: display.id,
			display: display.bounds,
			frame: verticalRect(display.workArea),
			safeAreas: true,
			locked: true,
		}
	);
}
export function verticalCaptureBounds() {
	return value?.enabled ? value.frame : null;
}
export function verticalLocalFrame() {
	if (!value?.enabled) return undefined;
	const v = verticalInfo();
	return v.enabled
		? {
				...v.frame,
				x: v.frame.x - v.display.x,
				y: v.frame.y - v.display.y,
				safeAreas: v.safeAreas,
			}
		: undefined;
}
export function verticalCaptureConfig() {
	if (!value?.enabled) return {};
	const v = verticalInfo();
	if (!v.enabled) return {};
	if (process.platform !== "darwin") throw Error("Vertical capture currently requires macOS.");
	if (
		selectedSource?.id?.startsWith("window:") ||
		Number(selectedSource?.display_id) !== v.displayId
	)
		throw Error(
			"Vertical capture records the framed display. Select that screen, or turn off Vertical 9:16 before changing sources.",
		);
	if (!screen.getAllDisplays().some((d) => d.id === v.displayId))
		throw Error("The vertical display is disconnected. Choose a new frame.");
	return { captureRegion: verticalLocalFrame() };
}
async function notify() {
	if (value?.enabled) {
		if (!guide || guide.isDestroyed()) {
			guide = new BrowserWindow({
				title: VERTICAL_GUIDE_TITLE,
				...value.display,
				frame: false,
				transparent: true,
				backgroundColor: "#00000000",
				show: false,
				resizable: false,
				hasShadow: false,
				alwaysOnTop: true,
				skipTaskbar: true,
				enableLargerThanScreen: true,
				webPreferences: {
					preload: path.join(app.getAppPath(), "dist-electron/preload.mjs"),
					sandbox: true,
					contextIsolation: true,
					nodeIntegration: false,
				},
			});
			protectAppWindow(guide);
			guide.setIgnoreMouseEvents(true);
			guide.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
			const base =
				process.env.VITE_DEV_SERVER_URL ||
				getPackagedRendererBaseUrl() ||
				pathToFileURL(path.join(app.getAppPath(), "dist/index.html")).href;
			await guide.loadURL(base + "?windowType=vertical-guide");
			pointer = setInterval(() => {
				if (!guide || guide.isDestroyed() || !value) return;
				const p = screen.getCursorScreenPoint(),
					f = value.frame;
				const inside =
					p.x >= f.x - 12 &&
					p.x <= f.x + f.width + 12 &&
					p.y >= f.y - 12 &&
					p.y <= f.y + f.height + 12;
				const edge =
					inside &&
					(p.x < f.x + 12 ||
						p.x > f.x + f.width - 12 ||
						p.y < f.y + 30 ||
						p.y > f.y + f.height - 12);
				guide.setIgnoreMouseEvents(
					isCursorCaptureActive ||
						nativeScreenRecordingActive ||
						!(edge || dragUntil > Date.now()),
				);
			}, 50);
			guide.on("closed", () => {
				clearInterval(pointer);
				guide = undefined;
			});
		}
		guide.setBounds(value.display);
		guide.showInactive();
	} else {
		guide?.hide();
	}
	for (const w of BrowserWindow.getAllWindows())
		if (!w.isDestroyed()) w.webContents.send("vertical:changed", verticalInfo());
	for (const fn of listeners) fn();
}
export async function verticalRequest(method: string, input: unknown) {
	if (method === "info") return verticalInfo();
	if (method === "drag") {
		if (!isCursorCaptureActive && !nativeScreenRecordingActive)
			dragUntil = input === true ? Date.now() + 30000 : 0;
		return verticalInfo();
	}
	if (isCursorCaptureActive || nativeScreenRecordingActive)
		throw Error("Stop recording before changing the vertical frame.");
	if (process.platform !== "darwin") throw Error("Vertical capture currently requires macOS.");
	const data = z
		.object({
			enabled: z.boolean().optional(),
			frame: captureRectSchema.optional(),
			locked: z.boolean().optional(),
			safeAreas: z.boolean().optional(),
		})
		.parse(input);
	if (data.enabled === true && selectedSource?.id?.startsWith("window:"))
		throw Error("Choose a screen source before enabling Vertical 9:16.");
	const display =
		screen.getAllDisplays().find((d) => d.id === Number(selectedSource?.display_id)) ??
		screen.getPrimaryDisplay();
	const file = path.join(app.getPath("userData"), "vertical-frames.json");
	const raw = await fs
		.readFile(file, "utf8")
		.then((t) => JSON.parse(t))
		.catch(() => ({}));
	const saved = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
	if (data.enabled === true) {
		key = currentProjectPath ?? "new-recording";
		const prior = captureRectSchema.safeParse(saved[key]?.frame);
		value = {
			...verticalInfo(),
			displayId: display.id,
			display: display.bounds,
			frame: verticalRect(display.workArea, prior.success ? prior.data : undefined),
		};
	}
	value = {
		...verticalInfo(),
		...data,
		frame: verticalRect(display.workArea, data.frame ?? verticalInfo().frame),
		display: display.bounds,
		displayId: display.id,
	};
	await fs.mkdir(path.dirname(file), { recursive: true });
	saved[key] = { frame: value.frame };
	await fs.writeFile(file, JSON.stringify(saved));
	await notify();
	return value;
}
