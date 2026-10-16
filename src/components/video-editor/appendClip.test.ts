import { describe, expect, it } from "vitest";
import { isWebcamVisible } from "../../lib/webcamVisibility";
import { joinCameraCues, joinWebcamVisibility, mergeAppendedClip } from "./appendClip";
import { createProjectData, normalizeProjectEditor } from "./projectPersistence";

const layout = (x: number) => ({ x, y: 0.5, size: 26, roundness: 90, mirror: true, locked: false });

describe("appending a recorded clip", () => {
	it("keeps the first take's webcam state and starts the new take from its own", () => {
		const events = joinWebcamVisibility(
			[
				{ timeMs: 0, visible: true },
				{ timeMs: 500, visible: false },
			],
			true,
			[{ timeMs: 0, visible: true }],
			true,
			1000,
		);
		expect([0, 600, 1000, 1500].map((t) => isWebcamVisible(events, t))).toEqual([
			true,
			false,
			true,
			true,
		]);
		const onlySecond = joinWebcamVisibility(undefined, false, undefined, true, 1000);
		expect([0, 999, 1000].map((t) => isWebcamVisible(onlySecond, t))).toEqual([
			false,
			false,
			true,
		]);
		const onlyFirst = joinWebcamVisibility(undefined, true, undefined, false, 1000);
		expect([0, 1000].map((t) => isWebcamVisible(onlyFirst, t))).toEqual([true, false]);
	});

	it("cuts camera moves at the join instead of easing across it", () => {
		const cues = joinCameraCues(
			[
				{ timeMs: 0, layout: layout(0.1) },
				{ timeMs: 400, layout: layout(0.2) },
			],
			[{ timeMs: 0, layout: layout(0.9) }],
			1000,
		)!;
		expect(cues.map((c) => [c.timeMs, c.layout.x])).toEqual([
			[0, 0.1],
			[400, 0.2],
			[999, 0.2],
			[1000, 0.9],
		]);
		expect(
			joinCameraCues(undefined, [{ timeMs: 0, layout: layout(0.9) }], 1000),
		).toBeUndefined();
	});

	it("adds the new take as a clip after the existing edits", () => {
		const editor = normalizeProjectEditor({
			clipRegions: [{ id: "clip-1", startMs: 100, endMs: 900, speed: 1 }],
			zoomRegions: [],
		});
		const merged = mergeAppendedClip(
			{ ...createProjectData("/r/recording-1.mp4", editor), editor },
			{
				videoPath: "/r/recording-3.mp4",
				webcamPath: null,
				basePath: "/r/recording-1.mp4",
				firstDurationMs: 1000,
				secondDurationMs: 2000,
				firstHadWebcam: false,
				second: { hasWebcam: false },
			},
			{
				zoomRegions: [],
				audioRegions: [
					{ id: "append-s", startMs: 1200, endMs: 1400, audioPath: "/a.wav", volume: 1 },
				],
			},
			"clip-2",
		);
		expect(merged.videoPath).toBe("/r/recording-3.mp4");
		expect(merged.editor.clipRegions).toMatchObject([
			{ id: "clip-1", startMs: 100, endMs: 900, speed: 1 },
			{ id: "clip-2", startMs: 1000, endMs: 3000, speed: 1 },
		]);
		expect(merged.editor.trimRegions.map((t) => [t.startMs, t.endMs])).toEqual([
			[0, 100],
			[900, 1000],
		]);
		expect(merged.editor.audioRegions).toHaveLength(1);
		expect(merged.editor.webcam).toBe(editor.webcam);
	});
});
