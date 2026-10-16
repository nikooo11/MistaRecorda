import { describe, expect, it } from "vitest";
import { makeElement } from "../../../electron/board/store";
import {
	canTouchSelect,
	segmentTouchesBox,
	selectionBox,
	touchesBox,
	touchSelection,
} from "./touchSelection";

const box = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2 });
const rect = (id: string, extra: Record<string, unknown> = {}) =>
	makeElement({ type: "rectangle", id, x: 0, y: 0, width: 100, height: 100, ...extra });
const stroke = (id: string, points: number[][], extra: Record<string, unknown> = {}) => ({
	...makeElement({ type: "freedraw", id, x: 100, y: 100, ...extra }),
	points,
});

describe("touch box selection", () => {
	it("normalizes a selection box dragged in any direction", () => {
		expect(selectionBox({ x: 50, y: 40, width: -20, height: -10 })).toEqual(
			box(30, 30, 50, 40),
		);
	});
	it("clips segments against the box", () => {
		expect(segmentTouchesBox([-10, 5], [20, 5], box(0, 0, 10, 10))).toBe(true);
		expect(segmentTouchesBox([-10, -10], [20, -5], box(0, 0, 10, 10))).toBe(false);
		expect(segmentTouchesBox([-5, 15], [15, -5], box(0, 0, 10, 10))).toBe(true);
	});
	it("selects a shape the box only partly covers", () => {
		expect(touchesBox(rect("a"), box(80, 80, 200, 200))).toBe(true);
		expect(touchesBox(rect("a"), box(120, 120, 200, 200))).toBe(false);
	});
	it("ignores a box drawn inside a hollow shape but not inside a filled one", () => {
		expect(touchesBox(rect("a"), box(30, 30, 60, 60))).toBe(false);
		expect(touchesBox(rect("a", { backgroundColor: "#ffc9c9" }), box(30, 30, 60, 60))).toBe(
			true,
		);
		expect(touchesBox(makeElement({ type: "text", id: "t" }), box(30, 30, 60, 60))).toBe(true);
	});
	it("accounts for rotation", () => {
		// A 100x10 bar rotated 90 degrees stands vertically around its center (50, 5).
		const bar = rect("bar", { width: 100, height: 10, angle: Math.PI / 2 });
		expect(touchesBox(bar, box(80, 0, 120, 10))).toBe(false);
		expect(touchesBox(bar, box(45, -40, 48, -30))).toBe(true);
	});
	it("follows the ellipse and diamond outlines rather than their corners", () => {
		const ellipse = makeElement({ type: "ellipse", id: "e", width: 100, height: 100 });
		const diamond = makeElement({ type: "diamond", id: "d", width: 100, height: 100 });
		expect(touchesBox(ellipse, box(0, 0, 5, 5))).toBe(false);
		expect(touchesBox(diamond, box(0, 0, 10, 10))).toBe(false);
		expect(touchesBox(diamond, box(40, 0, 60, 10))).toBe(true);
	});
	it("touches freedraw strokes along their ink, not their bounding box", () => {
		// An L-shaped stroke: across the top, then down the right side.
		const ink = stroke("ink", [
			[0, 0],
			[100, 0],
			[100, 100],
		]);
		expect(touchesBox(ink, box(150, 90, 250, 110))).toBe(true);
		expect(touchesBox(ink, box(120, 150, 160, 190))).toBe(false);
		expect(touchesBox(ink, box(190, 150, 300, 160))).toBe(true);
	});
	it("skips deleted, locked, frame and bound-text elements", () => {
		expect(canTouchSelect({ ...rect("a"), locked: true })).toBe(false);
		expect(canTouchSelect({ ...rect("a"), isDeleted: true })).toBe(false);
		expect(canTouchSelect({ ...rect("f"), type: "frame" })).toBe(false);
		expect(
			canTouchSelect({ ...makeElement({ type: "text", id: "t" }), containerId: "a" }),
		).toBe(false);
		expect(canTouchSelect(rect("a"))).toBe(true);
	});
	it("adds touched objects to the selection and selects whole groups", () => {
		const a = rect("a", { groupIds: ["inner", "outer"] });
		const b = rect("b", { x: 500, y: 500, groupIds: ["outer"] });
		const c = rect("c", { x: 1000, y: 1000 });
		const lone = rect("lone", { x: 2000, y: 2000 });
		const next = touchSelection([a, b, c, lone], box(90, 90, 110, 110), {
			selectedElementIds: { lone: true },
			selectedGroupIds: {},
		});
		expect(next?.selectedElementIds).toEqual({ lone: true, a: true, b: true });
		expect(next?.selectedGroupIds).toEqual({ outer: true });
	});
	it("selects the next group level while editing a group", () => {
		const a = rect("a", { groupIds: ["inner", "outer"] });
		const b = rect("b", { x: 500, groupIds: ["inner", "outer"] });
		const c = rect("c", { x: 1000, groupIds: ["outer"] });
		const next = touchSelection([a, b, c], box(90, 90, 110, 110), {
			selectedElementIds: {},
			editingGroupId: "outer",
		});
		expect(next?.selectedElementIds).toEqual({ a: true, b: true });
		expect(next?.selectedGroupIds).toEqual({ inner: true });
	});
	it("reports no change when everything touched is already selected", () => {
		const a = rect("a");
		expect(
			touchSelection([a], box(90, 90, 110, 110), { selectedElementIds: { a: true } }),
		).toBe(undefined);
		expect(touchSelection([a], box(300, 300, 400, 400), { selectedElementIds: {} })).toBe(
			undefined,
		);
	});
});
