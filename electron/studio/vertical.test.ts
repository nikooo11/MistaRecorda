import { afterEach, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const env = vi.hoisted(() => ({
	dir: "",
	currentProjectPath: null,
	selectedSource: { id: "screen:1:0", display_id: "1" },
	isCursorCaptureActive: false,
	nativeScreenRecordingActive: false,
}));
vi.mock("../ipc/state", () => env);
vi.mock("electron", () => ({
	app: { getPath: () => env.dir, getAppPath: () => env.dir },
	screen: {
		getAllDisplays: () => [
			{
				id: 1,
				bounds: { x: 0, y: 0, width: 1512, height: 982 },
				workArea: { x: 0, y: 25, width: 1512, height: 900 },
			},
		],
		getPrimaryDisplay: () => ({
			id: 1,
			bounds: { x: 0, y: 0, width: 1512, height: 982 },
			workArea: { x: 0, y: 25, width: 1512, height: 900 },
		}),
	},
	BrowserWindow: class {
		static getAllWindows() {
			return [];
		}
		webContents = { send: vi.fn() };
		setContentProtection() {}
		getTitle() {
			return "MistaRecorda Vertical Guide";
		}
		setIgnoreMouseEvents() {}
		setVisibleOnAllWorkspaces() {}
		async loadURL() {}
		on() {}
		setBounds() {}
		showInactive() {}
		hide() {}
		isDestroyed() {
			return false;
		}
	},
}));
vi.mock("../rendererServer", () => ({ getPackagedRendererBaseUrl: () => "http://localhost/" }));
afterEach(async () => {
	vi.clearAllTimers();
	vi.useRealTimers();
	env.isCursorCaptureActive = false;
	env.selectedSource = { id: "screen:1:0", display_id: "1" };
	if (env.dir) await fs.rm(env.dir, { recursive: true, force: true });
});
it.skipIf(process.platform !== "darwin")(
	"locks active capture and rejects changing the framed screen",
	async () => {
		vi.useFakeTimers();
		vi.resetModules();
		env.dir = await fs.mkdtemp(path.join(os.tmpdir(), "vertical-test-"));
		const { verticalRequest, verticalCaptureConfig } = await import("./vertical");
		const enabled = await verticalRequest("update", { enabled: true });
		expect(enabled.frame.width / enabled.frame.height).toBeCloseTo(9 / 16);
		expect(verticalCaptureConfig().captureRegion?.width).toBe(enabled.frame.width);
		env.isCursorCaptureActive = true;
		await expect(
			verticalRequest("update", { frame: { x: 0, y: 0, width: 9, height: 16 } }),
		).rejects.toThrow("Stop recording");
		env.selectedSource = { id: "window:99:0", display_id: "1" };
		expect(() => verticalCaptureConfig()).toThrow("framed display");
	},
);
it.skipIf(process.platform !== "darwin")(
	"recovers invalid preferences and remembers the frame for the next take",
	async () => {
		vi.useFakeTimers();
		vi.resetModules();
		env.dir = await fs.mkdtemp(path.join(os.tmpdir(), "vertical-test-"));
		await fs.writeFile(path.join(env.dir, "vertical-frames.json"), "null");
		const { verticalRequest } = await import("./vertical");
		await verticalRequest("update", { enabled: true });
		const at = await verticalRequest("update", {
			frame: { x: 100, y: 70, width: 225, height: 400 },
		});
		await verticalRequest("update", { enabled: false });
		const again = await verticalRequest("update", { enabled: true });
		expect(again.frame).toEqual(at.frame);
	},
);
