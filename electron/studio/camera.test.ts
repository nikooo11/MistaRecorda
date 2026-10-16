import type { BrowserWindow } from "electron";
import { afterEach, expect, test, vi } from "vitest";
import { cameraPosition, DEFAULT_CAMERA_LAYOUT } from "../../src/lib/cameraLayout";
const host = vi.hoisted(() => ({ cursor: { x: 0, y: 0 } }));
const clock = vi.hoisted(() => ({ active: true, time: 0 }));
vi.mock("electron", () => ({
	app: { getAppPath: () => "/app" },
	screen: { getCursorScreenPoint: () => host.cursor },
	BrowserWindow: class {
		rect = { x: 0, y: 0, width: 100, height: 100 };
		listeners: Record<string, () => void> = {};
		webContents = { send: vi.fn() };
		loadURL = vi.fn(async () => {});
		setContentProtection = vi.fn();
		setVisibleOnAllWorkspaces = vi.fn();
		setMovable = vi.fn();
		setHasShadow = vi.fn();
		hide = vi.fn();
		showInactive = vi.fn();
		destroy = vi.fn();
		isDestroyed = () => false;
		getBounds = () => this.rect;
		setBounds = vi.fn((rect: typeof this.rect) => {
			this.rect = { ...rect, y: Math.max(32, rect.y) };
			this.listeners.move?.();
		});
		on = (event: string, fn: () => void) => {
			this.listeners[event] = fn;
		};
	},
}));
vi.mock("../rendererServer", () => ({ getPackagedRendererBaseUrl: () => "http://localhost" }));
vi.mock("../ipc/state", () => ({
	get isCursorCaptureActive() {
		return clock.active;
	},
}));
vi.mock("../ipc/cursor/telemetry", () => ({
	getCursorCaptureElapsedMs: () => clock.time,
	getRecordingBoundsInDips: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
}));
import { CaptureCamera } from "./camera";
afterEach(() => {
	clock.active = true;
	clock.time = 0;
	host.cursor = { x: 0, y: 0 };
});
test("long stationary gaps do not animate; same-time changes while paused replace the cue", () => {
	const camera = new CaptureCamera(
		() => DEFAULT_CAMERA_LAYOUT,
		() => {},
	);
	camera.start();
	clock.time = 3000;
	camera.record({ ...DEFAULT_CAMERA_LAYOUT, x: 0 });
	expect(camera.cues.map((c) => c.timeMs)).toEqual([0, 2984, 3000]);
	expect(camera.cues[1].layout.x).toBe(DEFAULT_CAMERA_LAYOUT.x);
	camera.record({ ...DEFAULT_CAMERA_LAYOUT, x: 0.5 });
	expect(camera.cues).toHaveLength(3);
	expect(camera.cues[2].layout.x).toBe(0.5);
	clock.active = false;
	camera.record({ ...DEFAULT_CAMERA_LAYOUT, x: 1 });
	expect(camera.cues).toHaveLength(3);
	camera.start();
	expect(camera.cues).toHaveLength(1);
});

test("camera uses the recorder's origin and ignores programmatic macOS window clamping", async () => {
	vi.useFakeTimers();
	vi.stubEnv("VITE_DEV_SERVER_URL", "");
	const changed = vi.fn();
	const camera = new CaptureCamera(() => ({ ...DEFAULT_CAMERA_LAYOUT, x: 0, y: 0 }), changed);
	try {
		await camera.update({ enabled: true });
		const win = camera.window!;
		expect(win.loadURL).toHaveBeenCalledWith(
			"file:///app/dist/index.html?windowType=camera-overlay",
		);
		expect(win.setContentProtection).toHaveBeenCalledWith(true);
		expect(win.showInactive).toHaveBeenCalled();
		expect(changed).not.toHaveBeenCalled();
		camera.sync();
		camera.sync();
		expect(win.setBounds).toHaveBeenCalledTimes(1);
		const moved = { ...win.getBounds(), x: 420, y: 180 };
		win.setBounds(moved);
		expect(changed).toHaveBeenCalledWith({
			...DEFAULT_CAMERA_LAYOUT,
			...cameraPosition(moved, { x: 0, y: 0, width: 1920, height: 1080 }),
		});
		await camera.update({ enabled: false });
		expect(win.hide).toHaveBeenCalled();
	} finally {
		camera.destroy();
		vi.useRealTimers();
		vi.unstubAllEnvs();
	}
});

test("facecam dragging uses screen coordinates even as the overlay moves", () => {
	const layout = { ...DEFAULT_CAMERA_LAYOUT };
	const camera = new CaptureCamera(() => layout, vi.fn());
	const setPosition = vi.fn();
	camera.window = {
		isDestroyed: () => false,
		getBounds: () => ({ x: -500, y: 100, width: 200, height: 200 }),
		setPosition,
	} as unknown as BrowserWindow;
	host.cursor = { x: -450, y: 150 };
	camera.drag("start");
	host.cursor = { x: -350, y: 200 };
	camera.drag("move");
	expect(setPosition).toHaveBeenLastCalledWith(-400, 150, false);
	host.cursor = { x: -300, y: 225 };
	camera.drag("move");
	expect(setPosition).toHaveBeenLastCalledWith(-350, 175, false);
	camera.drag("end");
	setPosition.mockClear();
	host.cursor = { x: 100, y: 300 };
	camera.drag("move");
	expect(setPosition).not.toHaveBeenCalled();
});

test("locking the facecam cancels a drag and prevents movement until a fresh gesture", () => {
	const layout = { ...DEFAULT_CAMERA_LAYOUT };
	const camera = new CaptureCamera(() => layout, vi.fn());
	const setPosition = vi.fn();
	camera.window = {
		isDestroyed: () => false,
		getBounds: () => ({ x: 50, y: 100, width: 200, height: 200 }),
		setPosition,
	} as unknown as BrowserWindow;
	camera.drag("start");
	layout.locked = true;
	host.cursor = { x: 100, y: 100 };
	camera.drag("move");
	layout.locked = false;
	camera.drag("move");
	expect(setPosition).not.toHaveBeenCalled();
});
