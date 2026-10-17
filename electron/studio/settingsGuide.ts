import { protectAppWindow } from "./captureVisibility";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow } from "electron";
import { getPackagedRendererBaseUrl } from "../rendererServer";
import { showCapturePanel } from "../panelToggle";

let guide: BrowserWindow | undefined;
let opening: Promise<void> | undefined;
export async function openSettingsGuide() {
	if (opening) return opening;
	if (guide && !guide.isDestroyed()) {
		showCapturePanel(guide, BrowserWindow.getAllWindows());
		return;
	}
	const window = new BrowserWindow({
		title: "MistaRecorda — Settings tutorial",
		...(process.platform === "darwin" && {
			titleBarStyle: "hiddenInset",
			trafficLightPosition: { x: 14, y: 14 },
		}),
		width: 840,
		height: 700,
		minWidth: 620,
		minHeight: 570,
		show: false,
		backgroundColor: "#24262b",
		webPreferences: {
			preload: path.join(app.getAppPath(), "dist-electron/preload.mjs"),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
		},
	});
	guide = window;
	protectAppWindow(window);
	const base =
		process.env.VITE_DEV_SERVER_URL ||
		getPackagedRendererBaseUrl() ||
		pathToFileURL(path.join(app.getAppPath(), "dist/index.html")).href;
	opening = window
		.loadURL(`${base}?windowType=settings-guide`)
		.then(() => {
			if (!window.isDestroyed()) showCapturePanel(window, BrowserWindow.getAllWindows());
		})
		.catch((error) => {
			if (!window.isDestroyed()) window.destroy();
			throw error;
		})
		.finally(() => {
			opening = undefined;
		});
	return opening;
}
