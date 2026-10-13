import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
const mock = vi.hoisted(() => ({ dir: "", point: { x: 350, y: 250 }, send: vi.fn() }));
vi.mock("electron", () => ({
	app: { getPath: () => mock.dir },
	BrowserWindow: {
		getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: mock.send } }],
	},
	screen: { getCursorScreenPoint: () => mock.point },
}));
import {
	closeHeldZoom,
	loadZoomSettings,
	persistRecordedZooms,
	saveZoomSettings,
	startZoomCapture,
	stopZoomCapture,
	zoomKeyEvent,
	zoomStatus,
} from "./capture";
import { defaultRecordingZoomSettings } from "../../../src/types/recordingZoom";
afterEach(async () => {
	stopZoomCapture(0);
	if (mock.dir) await fs.rm(mock.dir, { recursive: true, force: true });
});
test("global key routing respects modifiers, ignores repeats/paused input and persists source metadata once", async () => {
	mock.dir = await fs.mkdtemp(path.join(os.tmpdir(), "held-zoom-"));
	await saveZoomSettings({ ...defaultRecordingZoomSettings, key: "Z", ctrl: true });
	await loadZoomSettings();
	startZoomCapture(() => ({ x: 0, y: 0, width: 1000, height: 800 }));
	zoomKeyEvent(true, { keycode: 44 }, 0, false);
	zoomKeyEvent(false, { keycode: 44 }, 200, false);
	expect(zoomStatus().count).toBe(0);
	zoomKeyEvent(true, { keycode: 44, ctrlKey: true }, 300, false);
	mock.point = { x: 900, y: 650 };
	zoomKeyEvent(true, { keycode: 44, ctrlKey: true }, 500, false);
	closeHeldZoom(800); // pause boundary
	zoomKeyEvent(true, { keycode: 44, ctrlKey: true }, 800, true);
	zoomKeyEvent(false, { keycode: 44 }, 800, true);
	zoomKeyEvent(true, { keycode: 44, ctrlKey: true }, 900, false);
	stopZoomCapture(1400);
	const video = path.join(mock.dir, "test.mp4");
	await fs.writeFile(video, "unchanged original");
	await persistRecordedZooms(video);
	const data = JSON.parse(await fs.readFile(`${video}.zooms.json`, "utf8"));
	expect(
		data.regions.map((r: { startMs: number; endMs: number }) => [r.startMs, r.endMs]),
	).toEqual([
		[300, 800],
		[900, 1400],
	]);
	expect(data.regions[0].focus).toEqual({ cx: 0.35, cy: 0.3125 });
	expect(await fs.readFile(video, "utf8")).toBe("unchanged original");
	await persistRecordedZooms(path.join(mock.dir, "different.mp4"));
	await expect(fs.stat(path.join(mock.dir, "different.mp4.zooms.json"))).rejects.toThrow();
});

test("tap toggles follow on/off without repeats or unmatched key-up restarting it", async () => {
	mock.dir = await fs.mkdtemp(path.join(os.tmpdir(), "follow-zoom-"));
	await saveZoomSettings({ ...defaultRecordingZoomSettings, ctrl: true });
	mock.point = { x: 400, y: 400 };
	startZoomCapture(() => ({ x: 0, y: 0, width: 1000, height: 800 }));
	zoomKeyEvent(true, { keycode: 44, ctrlKey: true }, 100, false);
	zoomKeyEvent(false, { keycode: 44 }, 180, false);
	expect(zoomStatus()).toMatchObject({ holding: true, following: true, count: 0 });
	zoomKeyEvent(false, { keycode: 44 }, 250, false); // duplicate release
	zoomKeyEvent(true, { keycode: 44 }, 300, false); // wrong modifiers
	zoomKeyEvent(false, { keycode: 44 }, 350, false);
	expect(zoomStatus().following).toBe(true);
	mock.point = { x: 1500, y: 900 }; // toggling off works outside the capture
	zoomKeyEvent(true, { keycode: 44, ctrlKey: true }, 2100, false);
	zoomKeyEvent(true, { keycode: 44, ctrlKey: true }, 2130, false); // repeat
	zoomKeyEvent(false, { keycode: 44 }, 2180, false);
	expect(zoomStatus()).toMatchObject({ holding: false, following: false, count: 1 });
	const video = path.join(mock.dir, "follow.mp4");
	await persistRecordedZooms(video);
	const { regions } = JSON.parse(await fs.readFile(`${video}.zooms.json`, "utf8"));
	expect(regions).toHaveLength(1);
	expect(regions[0]).toMatchObject({ startMs: 100, endMs: 2100, mode: "auto" });
});

test("pause ends follow and a key release after pause cannot latch another zoom", async () => {
	mock.dir = await fs.mkdtemp(path.join(os.tmpdir(), "pause-zoom-"));
	await saveZoomSettings(defaultRecordingZoomSettings);
	mock.point = { x: 400, y: 400 };
	startZoomCapture(() => ({ x: 0, y: 0, width: 1000, height: 800 }));
	zoomKeyEvent(true, { keycode: 44 }, 100, false);
	zoomKeyEvent(false, { keycode: 44 }, 180, false);
	closeHeldZoom(1000);
	expect(zoomStatus()).toMatchObject({ following: false, count: 1 });
	zoomKeyEvent(true, { keycode: 44 }, 1000, true);
	zoomKeyEvent(false, { keycode: 44 }, 1100, false);
	expect(zoomStatus().holding).toBe(false);
	zoomKeyEvent(true, { keycode: 44 }, 1200, false);
	closeHeldZoom(1300); // pause mid-press before tap threshold
	zoomKeyEvent(false, { keycode: 44 }, 1300, true);
	expect(zoomStatus().holding).toBe(false);
	zoomKeyEvent(true, { keycode: 44 }, 1400, false);
	zoomKeyEvent(false, { keycode: 44 }, 1480, false);
	stopZoomCapture(2000);
	expect(zoomStatus()).toMatchObject({ recording: false, following: false, count: 3 });
});
