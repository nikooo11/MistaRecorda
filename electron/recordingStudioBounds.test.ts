import { expect, test } from "vitest";
import { recordingStudioBounds } from "./recordingStudioBounds";
test("removed displays cannot strand a saved studio offscreen", () => {
	expect(
		recordingStudioBounds(
			{ x: 0, y: 25, width: 1440, height: 875 },
			{ x: 3000, y: 1800, width: 1100, height: 700 },
		),
	).toEqual({ x: 340, y: 200, width: 1100, height: 700 });
});
test("small and negative-origin displays remain reachable", () => {
	expect(recordingStudioBounds({ x: -800, y: 0, width: 800, height: 500 })).toEqual({
		x: -800,
		y: 0,
		width: 800,
		height: 500,
	});
});
test("corrupt persisted dimensions fall back safely", () => {
	const result = recordingStudioBounds(
		{ x: 0, y: 0, width: 1440, height: 900 },
		{ x: NaN, y: Infinity, width: -1, height: NaN },
	);
	expect(result).toEqual({ x: 310, y: 70, width: 820, height: 760 });
});
