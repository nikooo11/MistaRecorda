import { app, BrowserWindow } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getRecordingBoundsInDips, getCursorCaptureElapsedMs } from "../ipc/cursor/telemetry";
import { isCursorCaptureActive } from "../ipc/state";
import {
	cameraRect,
	cameraPosition,
	type CameraLayout,
	type CameraLayoutCue,
} from "../../src/lib/cameraLayout";

/** A protected, independent camera window survives hiding the recorder controls. */
export class CaptureCamera {
	window?: BrowserWindow;
	status = {
		enabled: false,
		deviceId: undefined as string | undefined,
		preview: true,
		error: "",
	};
	cues: CameraLayoutCue[] = [];
	private timer?: ReturnType<typeof setInterval>;
	private loading?: Promise<void>;
	private target = "";
	private desired = "";
	private applyingBounds = false;
	constructor(
		private getLayout: () => CameraLayout,
		private changed: (layout: CameraLayout) => void,
	) {}
	private bounds() {
		return getRecordingBoundsInDips() ?? { x: 0, y: 0, width: 1280, height: 720 };
	}
	start() {
		this.cues = [{ timeMs: 0, layout: { ...this.getLayout() } }];
		this.sync();
	}
	record(layout: CameraLayout) {
		if (!isCursorCaptureActive || this.cues.length >= 100000) return;
		const timeMs = Math.round(getCursorCaptureElapsedMs());
		const previous = this.cues[this.cues.length - 1];
		// Hold still through idle gaps, then interpolate only the actual drag.
		if (previous && timeMs - previous.timeMs > 100)
			this.cues.push({
				timeMs: Math.max(previous.timeMs, timeMs - 16),
				layout: { ...previous.layout },
			});
		if (previous?.timeMs === timeMs) this.cues.pop();
		this.cues.push({ timeMs, layout: { ...layout } });
	}
	async update(status: Partial<typeof this.status>) {
		Object.assign(this.status, status);
		if (
			!this.status.enabled ||
			!this.status.preview ||
			(isCursorCaptureActive && process.platform === "linux")
		) {
			this.window?.hide();
			this.window?.webContents.send("camera:status", this.status);
			return;
		}
		if (!this.window || this.window.isDestroyed()) {
			const win = new BrowserWindow({
				title: "MistaRecorda Camera",
				...cameraRect(this.getLayout(), this.bounds()),
				frame: false,
				transparent: true,
				backgroundColor: "#00000000",
				show: false,
				resizable: false,
				movable: !this.getLayout().locked,
				hasShadow: false,
				skipTaskbar: true,
				alwaysOnTop: true,
				webPreferences: {
					preload: path.join(app.getAppPath(), "dist-electron/preload.mjs"),
					sandbox: true,
					contextIsolation: true,
					nodeIntegration: false,
				},
			});
			this.window = win;
			win.setContentProtection(true);
			win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
			win.on("move", () => {
				if (win.isDestroyed() || this.getLayout().locked || this.applyingBounds) return;
				const rect = win.getBounds();
				if (JSON.stringify(rect) === this.target) return;
				this.changed({ ...this.getLayout(), ...cameraPosition(rect, this.bounds()) });
			});
			const base =
				process.env.VITE_DEV_SERVER_URL ||
				pathToFileURL(path.join(app.getAppPath(), "dist/index.html")).href;
			this.loading = win.loadURL(`${base}?windowType=camera-overlay`);
			this.timer = setInterval(() => this.sync(), 150);
			win.on("closed", () => {
				clearInterval(this.timer);
				this.window = undefined;
			});
		}
		await this.loading;
		if (
			!this.status.enabled ||
			!this.status.preview ||
			(isCursorCaptureActive && process.platform === "linux")
		)
			return;
		this.sync();
		this.window?.showInactive();
	}
	sync() {
		const win = this.window;
		if (!win || win.isDestroyed()) return;
		const rect = cameraRect(this.getLayout(), this.bounds());
		const desired = JSON.stringify(rect);
		if (desired !== this.desired) {
			this.applyingBounds = true;
			try {
				win.setBounds(rect, false);
				// macOS keeps floating windows below the menu bar. Do not mistake
				// that system adjustment for a user drag or rewrite the chosen preset.
				this.target = JSON.stringify(win.getBounds());
				this.desired = desired;
			} finally {
				this.applyingBounds = false;
			}
		}
		win.setMovable(!this.getLayout().locked);
		win.webContents.send("camera:status", this.status);
	}
	destroy() {
		clearInterval(this.timer);
		this.window?.destroy();
	}
}
