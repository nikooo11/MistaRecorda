import { describe, expect, it } from "vitest";
import { clampPanel } from "./tabletPanels";

describe("iPad panel bounds", () => {
	it("uses the whole workspace, including margins outside the fitted Mac image", () => {
		expect(clampPanel(6, 60, 48, 280, { left: 0, top: 42, width: 1194, height: 658 })).toEqual({
			x: 6,
			y: 60,
		});
	});
	it("keeps a dragged panel reachable after rotation and on smaller displays", () => {
		expect(
			clampPanel(1100, 900, 300, 400, { left: 0, top: 42, width: 700, height: 600 }),
		).toEqual({ x: 396, y: 238 });
	});
	it("keeps the header accessible even when content exceeds the viewport", () => {
		expect(
			clampPanel(-500, 1000, 300, 900, { left: 0, top: 42, width: 350, height: 200 }),
		).toEqual({ x: 4, y: 46 });
	});
});
