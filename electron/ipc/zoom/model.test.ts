import { expect, test } from "vitest";
import { defaultRecordingZoomSettings } from "../../../src/types/recordingZoom";
import {
	HeldZoomCapture,
	canShowZoomOutline,
	normalizeRecordedZooms,
	validateZoomSettings,
	zoomTarget,
} from "./model";

test("holds follow the cursor and become editable auto intervals; repeat keydown does not restart them", () => {
	const capture = new HeldZoomCapture();
	capture.press(150, { cx: 0.4, cy: 0.6 }, 3);
	capture.press(800, { cx: 0.8, cy: 0.2 }, 6);
	expect(capture.target({ cx: 0.7, cy: 0.3 })).toMatchObject({ cx: 0.7, cy: 0.3 });
	capture.releaseKey(1400);
	expect(capture.regions).toEqual([
		{
			id: expect.stringMatching(/^held-/),
			startMs: 150,
			endMs: 1400,
			depth: 3,
			focus: { cx: 0.4, cy: 0.6 },
			mode: "auto",
		},
	]);
	expect(normalizeRecordedZooms(JSON.parse(JSON.stringify(capture.regions)))).toEqual(
		capture.regions,
	);
});
test("pause/stop close an interval without latching; resumed holds use media time", () => {
	const capture = new HeldZoomCapture();
	capture.press(0, { cx: 0.5, cy: 0.5 }, 3);
	capture.release(50);
	expect(capture.regions).toEqual([]);
	capture.press(100, { cx: 0.5, cy: 0.5 }, 3);
	capture.release(600);
	capture.release(3000); // no duplicate when stopping after a pause
	capture.press(700, { cx: 0.4, cy: 0.4 }, 4);
	capture.release(1100);
	expect(capture.regions.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([
		[100, 600],
		[700, 1100],
	]);
});
test("a tap locks the initial target and preserves manual mode through sidecar loading", () => {
	const capture = new HeldZoomCapture();
	capture.press(100, { cx: 0.4, cy: 0.6 }, 3);
	capture.releaseKey(180);
	expect(capture.active?.mode).toBe("manual");
	expect(capture.regions).toEqual([]);
	expect(capture.target({ cx: 0.6, cy: 0.4 })).toMatchObject({ cx: 0.4, cy: 0.6 });
	capture.release(2000);
	expect(capture.active).toBeNull();
	expect(capture.regions[0]).toMatchObject({ startMs: 100, endMs: 2000, mode: "manual" });
	expect(normalizeRecordedZooms(JSON.parse(JSON.stringify(capture.regions)))).toEqual(
		capture.regions,
	);
});
test("the tap/hold boundary is deterministic", () => {
	const capture = new HeldZoomCapture();
	capture.press(100, { cx: 0.5, cy: 0.5 }, 3);
	capture.releaseKey(350);
	expect(capture.active).toBeNull();
	expect(capture.regions[0]?.mode).toBe("auto");
	capture.press(400, { cx: 0.5, cy: 0.5 }, 3);
	capture.releaseKey(649);
	expect(capture.active?.mode).toBe("manual");
});
test("outline bounds and normalized focus remain inside capture even at screen edges", () => {
	const target = zoomTarget({ cx: 0, cy: 1 }, 6);
	expect(target).toEqual({ cx: 0.1, cy: 0.9, x: 0, y: 0.8, width: 0.2, height: 0.2 });
});
test("outline fails closed on unprotected backends and old Windows builds", () => {
	expect(canShowZoomOutline("darwin", "24.0", false)).toBe(false);
	expect(canShowZoomOutline("darwin", "24.0", true)).toBe(true);
	expect(canShowZoomOutline("win32", "10.0.18363", false)).toBe(false);
	expect(canShowZoomOutline("win32", "10.0.19045", false)).toBe(true);
	expect(canShowZoomOutline("win32", "10.0.22631", false)).toBe(true);
	expect(canShowZoomOutline("linux", "6.1", true)).toBe(false);
});
test("settings reject unsupported keys and marker loading drops invalid coordinates/timing", () => {
	expect(
		validateZoomSettings({ ...defaultRecordingZoomSettings, key: "F8", ctrl: true }).key,
	).toBe("F8");
	expect(() =>
		validateZoomSettings({ ...defaultRecordingZoomSettings, key: "Escape" }),
	).toThrow();
	expect(() => validateZoomSettings({ ...defaultRecordingZoomSettings, depth: 9 })).toThrow();
	expect(
		normalizeRecordedZooms([
			{ id: "held-1", startMs: 2, endMs: 1, depth: 3, focus: { cx: 0, cy: 0 } },
		]),
	).toEqual([]);
});
