import { expect, test } from "vitest";
import { captureCanvasBounds } from "./geometry";
test("switching to a taller window maps its cursor inside pillarboxes", () => {
	const frame = captureCanvasBounds({ x: 100, y: 200, width: 600, height: 600 }, 16 / 9);
	expect((100 - frame.x) / frame.width).toBeCloseTo(0.21875);
	expect((400 - frame.x) / frame.width).toBeCloseTo(0.5);
	expect(frame.height).toBe(600);
});
test("switching to a wider window maps its cursor inside letterboxes", () => {
	const frame = captureCanvasBounds({ x: 100, y: 200, width: 1600, height: 900 }, 1);
	expect((200 - frame.y) / frame.height).toBeCloseTo(0.21875);
	expect(frame.width).toBe(1600);
});
test("original aspect and display recording preserve coordinates", () => {
	const frame = { x: 100, y: 200, width: 1600, height: 900 };
	expect(captureCanvasBounds(frame, 16 / 9)).toEqual(frame);
	expect(captureCanvasBounds(frame, null)).toEqual(frame);
});
