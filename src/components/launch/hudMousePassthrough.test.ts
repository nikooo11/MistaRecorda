import { shouldIgnoreHudMouse } from "./hudMousePassthrough";
import { describe, expect, it } from "vitest";

import {
	mergeHudInteractiveBounds,
	shouldRestoreHudMousePassthroughAfterDrag,
} from "./hudMousePassthrough";

const hudBounds = { left: 100, top: 200, right: 300, bottom: 260 };

describe("mergeHudInteractiveBounds", () => {
	it("returns null when there are no interactive bounds", () => {
		expect(mergeHudInteractiveBounds([null, undefined])).toBeNull();
	});

	it("merges the dropdown, bar, and webcam preview bounds", () => {
		expect(
			mergeHudInteractiveBounds([
				{ left: 120, top: 220, right: 260, bottom: 320 },
				{ left: 100, top: 200, right: 300, bottom: 260 },
				{ left: 140, top: 280, right: 340, bottom: 430 },
			]),
		).toEqual({ left: 100, top: 200, right: 340, bottom: 430 });
	});
});

describe("shouldRestoreHudMousePassthroughAfterDrag", () => {
	it("keeps the HUD interactive when the pointer is still inside the HUD", () => {
		expect(shouldRestoreHudMousePassthroughAfterDrag(hudBounds, 180, 230)).toBe(false);
	});

	it("keeps the HUD interactive when the pointer ends on the HUD edge", () => {
		expect(shouldRestoreHudMousePassthroughAfterDrag(hudBounds, 100, 200)).toBe(false);
		expect(shouldRestoreHudMousePassthroughAfterDrag(hudBounds, 300, 260)).toBe(false);
	});

	it("restores passthrough when the pointer ends outside the HUD", () => {
		expect(shouldRestoreHudMousePassthroughAfterDrag(hudBounds, 99, 230)).toBe(true);
		expect(shouldRestoreHudMousePassthroughAfterDrag(hudBounds, 180, 199)).toBe(true);
		expect(shouldRestoreHudMousePassthroughAfterDrag(hudBounds, 301, 230)).toBe(true);
		expect(shouldRestoreHudMousePassthroughAfterDrag(hudBounds, 180, 261)).toBe(true);
	});

	it("restores passthrough when no HUD bounds are available", () => {
		expect(shouldRestoreHudMousePassthroughAfterDrag(null, 180, 230)).toBe(true);
	});
});

describe("visible HUD hit regions", () => {
	const bar = { left: 400, top: 800, right: 1000, bottom: 870 };
	const menu = { left: 700, top: 450, right: 1000, bottom: 790 };
	it("passes clicks through the empty space above, below and beside the toolbar", () => {
		for (const point of [
			{ x: 600, y: 750 },
			{ x: 600, y: 875 },
			{ x: 350, y: 830 },
		]) {
			expect(shouldIgnoreHudMouse([bar], point)).toBe(true);
		}
		expect(shouldIgnoreHudMouse([bar], { x: 500, y: 830 })).toBe(false);
	});
	it("leaves gaps and the area beside an open menu click-through", () => {
		expect(shouldIgnoreHudMouse([bar, menu], { x: 500, y: 600 })).toBe(true);
		expect(shouldIgnoreHudMouse([bar, menu], { x: 800, y: 795 })).toBe(true);
		expect(shouldIgnoreHudMouse([bar, menu], { x: 800, y: 600 })).toBe(false);
	});
	it("tracks moved controls without capturing the rectangle between positions", () => {
		const moved = { left: 100, top: 100, right: 700, bottom: 170 };
		expect(shouldIgnoreHudMouse([moved], { x: 500, y: 830 })).toBe(true);
		expect(shouldIgnoreHudMouse([moved], { x: 500, y: 130 })).toBe(false);
	});
	it("retains pointer capture only until a drag or slider interaction finishes", () => {
		expect(shouldIgnoreHudMouse([bar], { x: 200, y: 200 }, true)).toBe(false);
		expect(shouldIgnoreHudMouse([bar], { x: 200, y: 200 }, false)).toBe(true);
	});
	it("passes all clicks through while selecting another app to record", () => {
		expect(shouldIgnoreHudMouse([bar], { x: 500, y: 830 }, true, true)).toBe(true);
		expect(shouldIgnoreHudMouse([], { x: 500, y: 830 })).toBe(true);
	});
});
