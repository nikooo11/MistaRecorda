import { protectAppWindow } from "../../studio/captureVisibility";
import { showCapturePanel } from "../../panelToggle";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { getPackagedRendererBaseUrl } from "../../rendererServer";
import { resolveApprovedLocalMediaPath } from "../project/manager";
import { loadZoomSettings, saveZoomSettings, zoomStatus } from "./capture";
import { normalizeRecordedZooms } from "./model";

let settingsWindow: BrowserWindow | null = null;
export function isZoomSettingsWindow(contents: Electron.WebContents) {
	return Boolean(
		settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.webContents === contents,
	);
}
function trusted(event: IpcMainInvokeEvent) {
	if (
		event.senderFrame !== event.sender.mainFrame ||
		!BrowserWindow.fromWebContents(event.sender)
	)
		return false;
	try {
		const url = new URL(event.senderFrame.url);
		url.search = "";
		url.hash = "";
		return [
			process.env.VITE_DEV_SERVER_URL,
			getPackagedRendererBaseUrl(),
			pathToFileURL(path.join(app.getAppPath(), "dist/index.html")).href,
		].some((base) => base && url.href === new URL(base).href);
	} catch {
		return false;
	}
}
export function registerRecordingZoomHandlers() {
	const ready = loadZoomSettings();
	ipcMain.handle("recording-zoom:status", async (event) => {
		if (!trusted(event)) throw new Error("noAccess");
		await ready;
		return zoomStatus();
	});
	ipcMain.handle("recording-zoom:save", async (event, input) => {
		if (!trusted(event)) return { success: false, error: "noAccess" };
		try {
			await ready;
			await saveZoomSettings(input);
			return { success: true };
		} catch (e) {
			return {
				success: false,
				error:
					e instanceof Error && e.message === "recordingActive"
						? "recordingActive"
						: "invalidSettings",
			};
		}
	});
	ipcMain.handle("recording-zoom:regions", async (event, input) => {
		if (!trusted(event) || typeof input !== "string") return { success: false, regions: [] };
		const videoPath = await resolveApprovedLocalMediaPath(input);
		if (!videoPath) return { success: false, regions: [] };
		try {
			const file = `${videoPath}.zooms.json`;
			const stat = await fs.lstat(file);
			if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024)
				return { success: false, regions: [] };
			const data = JSON.parse(await fs.readFile(file, "utf8"));
			return {
				success: true,
				regions: data.version === 1 ? normalizeRecordedZooms(data.regions) : [],
			};
		} catch {
			return { success: true, regions: [] };
		}
	});
	ipcMain.handle("recording-zoom:open", async (event, toggle = false) => {
		if (!trusted(event)) return;
		if (settingsWindow && !settingsWindow.isDestroyed()) {
			if (toggle && settingsWindow.isVisible()) settingsWindow.hide();
			else showCapturePanel(settingsWindow, BrowserWindow.getAllWindows());
			return;
		}
		settingsWindow = new BrowserWindow({
			title: "MistaRecorda — Hold to zoom",
			...(process.platform === "darwin" && {
				titleBarStyle: "hiddenInset",
				trafficLightPosition: { x: 14, y: 14 },
			}),
			width: 620,
			height: 420,
			minWidth: 480,
			minHeight: 380,
			backgroundColor: "#28292d",
			webPreferences: {
				preload: path.join(app.getAppPath(), "dist-electron/preload.mjs"),
				contextIsolation: true,
				nodeIntegration: false,
				sandbox: true,
			},
		});
		protectAppWindow(settingsWindow);
		settingsWindow.on("closed", () => {
			settingsWindow = null;
		});
		settingsWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
		settingsWindow.webContents.on("will-navigate", (e) => e.preventDefault());
		const base = process.env.VITE_DEV_SERVER_URL || getPackagedRendererBaseUrl();
		if (base) await settingsWindow.loadURL(`${base}?windowType=zoom-settings`);
		else
			await settingsWindow.loadFile(path.join(app.getAppPath(), "dist/index.html"), {
				query: { windowType: "zoom-settings" },
			});
		showCapturePanel(settingsWindow, BrowserWindow.getAllWindows());
	});
}
