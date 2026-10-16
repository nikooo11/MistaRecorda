import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { defaultRecordingZoomSettings } from "../../../src/types/recordingZoom";

const mock = vi.hoisted(() => ({
	dir: "",
	prepareAudio: vi.fn(),
	persistTake: vi.fn(),
	prune: vi.fn(),
}));
vi.mock("electron", () => ({
	app: { getPath: () => mock.dir },
	BrowserWindow: { getAllWindows: () => [] },
	screen: { getCursorScreenPoint: () => ({ x: 350, y: 250 }) },
}));
vi.mock("./library", () => ({ prepareRecordingAudio: mock.prepareAudio }));
vi.mock("../../studio/register", () => ({ persistStudioTake: mock.persistTake }));
vi.mock("./prune", () => ({ pruneAutoRecordings: mock.prune }));
vi.mock("./diagnostics", () => ({
	validateRecordedVideo: vi.fn(async () => ({ fileSizeBytes: 1000, durationSeconds: 5 })),
	recordNativeCaptureDiagnostics: vi.fn(),
	getFileSizeIfPresent: vi.fn(),
}));
vi.mock("../utils", () => ({
	isAutoRecordingPath: () => true,
	getTelemetryPathForVideo: (file: string) => `${file}.cursor.json`,
}));

import {
	currentVideoPath,
	setCurrentVideoPath,
	setCurrentProjectPath,
	currentProjectPath,
	setCursorCaptureStartTimeMs,
	setActiveCursorSamples,
	setPendingCursorSamples,
} from "../state";
import { resetCursorCaptureClock } from "../cursor/telemetry";
import {
	saveZoomSettings,
	startZoomCapture,
	stopZoomCapture,
	zoomKeyEvent,
	zoomStatus,
} from "../zoom/capture";
import { finalizeStoredVideo } from "./mac";

beforeEach(async () => {
	vi.clearAllMocks();
	mock.dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoom-finalization-"));
	vi.spyOn(Date, "now").mockReturnValue(6000);
	setCurrentVideoPath("previous.mp4");
	setCurrentProjectPath("previous.recordly");
	setCursorCaptureStartTimeMs(1000);
	resetCursorCaptureClock();
	setPendingCursorSamples([]);
	setActiveCursorSamples([{ timeMs: 100, cx: 0.35, cy: 0.3, interactionType: "move" }]);
	await saveZoomSettings(defaultRecordingZoomSettings);
	startZoomCapture(() => ({ x: 0, y: 0, width: 1000, height: 800 }));
	zoomKeyEvent(true, { keycode: 44 }, 100, false);
	zoomKeyEvent(false, { keycode: 44 }, 600, false); // held follow
	zoomKeyEvent(true, { keycode: 44 }, 1000, false);
	zoomKeyEvent(false, { keycode: 44 }, 1100, false); // tap locks until stop
});

afterEach(async () => {
	stopZoomCapture(5000);
	vi.restoreAllMocks();
	await fs.rm(mock.dir, { recursive: true, force: true });
});

test.each(["facecam-first", "screen-first"])(
	"screen owns tap/hold zooms and take metadata when saving %s",
	async (order) => {
		const screen = path.join(mock.dir, "recording-200.mp4");
		const webcam = path.join(mock.dir, "recording-100-webcam.mp4");
		if (order === "facecam-first") {
			await finalizeStoredVideo(webcam);
			expect(zoomStatus().holding).toBe(true);
			expect(currentVideoPath).toBe("previous.mp4");
			expect(currentProjectPath).toBe("previous.recordly");
			expect(mock.persistTake).not.toHaveBeenCalled();
			expect(mock.prune).not.toHaveBeenCalled();
		}
		await finalizeStoredVideo(screen);
		if (order === "screen-first") await finalizeStoredVideo(webcam);
		const zooms = JSON.parse(await fs.readFile(`${screen}.zooms.json`, "utf8"));
		expect(zooms.regions).toMatchObject([
			{ startMs: 100, endMs: 600, mode: "auto" },
			{ startMs: 1000, endMs: 5000, mode: "manual" },
		]);
		const cursor = JSON.parse(await fs.readFile(`${screen}.cursor.json`, "utf8"));
		expect(cursor.samples).toHaveLength(1);
		await expect(fs.stat(`${webcam}.zooms.json`)).rejects.toThrow();
		await expect(fs.stat(`${webcam}.cursor.json`)).rejects.toThrow();
		expect(currentVideoPath).toBe(screen);
		expect(mock.persistTake).toHaveBeenCalledExactlyOnceWith(screen);
		expect(mock.prepareAudio).toHaveBeenCalledExactlyOnceWith(screen);
		expect(mock.prune).toHaveBeenCalledExactlyOnceWith([screen]);
	},
);
