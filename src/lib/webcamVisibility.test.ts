import { expect, test } from "vitest";
import { isWebcamVisible, normalizeWebcamVisibility } from "./webcamVisibility";
test("camera can start late, hide, and return without changing source timing", () => {
	const events = [
		{ timeMs: 2000, visible: true },
		{ timeMs: 4000, visible: false },
		{ timeMs: 7000, visible: true },
	];
	expect(isWebcamVisible(events, 1999)).toBe(false);
	expect(isWebcamVisible(events, 2000)).toBe(true);
	expect(isWebcamVisible(events, 4000)).toBe(false);
	expect(isWebcamVisible(events, 6999)).toBe(false);
	expect(isWebcamVisible(events, 7000)).toBe(true);
	expect(isWebcamVisible(undefined, 0)).toBe(true);
});
test("imported camera cues discard invalid values and sort valid events", () => {
	expect(
		normalizeWebcamVisibility([
			{ timeMs: 20.4, visible: false },
			{ timeMs: -1, visible: true },
			{ timeMs: 0, visible: true },
			{ timeMs: 4, visible: "yes" },
		]),
	).toEqual([
		{ timeMs: 0, visible: true },
		{ timeMs: 20, visible: false },
	]);
});
