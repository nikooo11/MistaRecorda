import { expect, it } from "vitest";
import { verticalRect, insideCapture, captureSceneFrame } from "./vertical";
it("keeps a 9:16 frame inside the display, including negative monitor origins", () => {
	const display = { x: -1920, y: 28, width: 1920, height: 1052 };
	for (const requested of [
		{ x: -9999, y: 9999, height: 5000 },
		{ x: 9999, y: -9999, height: 10 },
		{},
	]) {
		const f = verticalRect(display, requested);
		expect(f.width / f.height).toBeCloseTo(9 / 16);
		expect(f.x).toBeGreaterThanOrEqual(display.x);
		expect(f.y).toBeGreaterThanOrEqual(display.y);
		expect(f.x + f.width).toBeLessThanOrEqual(display.x + display.width);
		expect(f.y + f.height).toBeLessThanOrEqual(display.y + display.height);
	}
});
it("maps portrait bounds into zoomed scene coordinates and fits large references without distortion", () => {
	const frame = captureSceneFrame(
		{ x: 400, y: 100, width: 450, height: 800 },
		{ zoom: 2, scrollX: 30, scrollY: -20 },
	);
	expect(frame).toEqual({ x: 170, y: 70, width: 225, height: 400 });
	const placed = insideCapture({ x: -400, y: 900, width: 1000, height: 500 }, frame);
	expect(placed).toEqual({ x: 170, y: 357.5, width: 225, height: 112.5 });
});
