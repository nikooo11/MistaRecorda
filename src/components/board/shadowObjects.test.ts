import { expect, test } from "vitest";
import { emptyBoardScene } from "../../types/board";
import { makeElement, validateScene } from "../../../electron/board/store";
import {
	isShadow,
	presentationMeta,
	preserveShadows,
	setShadow,
	shadowSelectionIds,
	visibleElements,
} from "./shadowObjects";
import { duplicateObjects, groupObjects } from "./objectEditing";

test("private notes are 50% on tablet and absent from every desktop projection", () => {
	const note = makeElement({ type: "text", text: "Private cue", note: true, opacity: 80 });
	const ink = makeElement({ type: "ellipse" });
	expect(isShadow(note)).toBe(true);
	expect(visibleElements([note, ink], true)[0].opacity).toBe(50);
	expect(visibleElements([note, ink], false)).toEqual([ink]);
	expect(visibleElements([note, ink], false, Date.now())).toEqual([ink]);
	expect(
		validateScene({ ...emptyBoardScene(), elements: [{ ...note, opacity: 100 }] }).elements[0]
			.opacity,
	).toBe(50);
	expect(setShadow(note, false).opacity).toBe(80);
});
test("reveal transitions end at exactly the saved geometry and opacity", () => {
	for (const enter of ["fade", "spin", "fall"] as const) {
		const note = setShadow(
			makeElement({ type: "text", x: 90, y: 300, note: true }),
			false,
			enter,
			1000,
		);
		const start = visibleElements([note], false, 1000)[0],
			halfway = visibleElements([note], false, 1225)[0],
			end = visibleElements([note], false, 1450)[0];
		expect(start.opacity).toBe(0);
		expect(halfway.opacity).toBe(50);
		expect(end).toEqual(note);
		expect(visibleElements([note], true, 1000)[0]).toEqual(note);
	}
	const instant = setShadow(
		makeElement({ type: "rectangle", shadow: true }),
		false,
		"none",
		1000,
	);
	expect(visibleElements([instant], false, 1000)[0].opacity).toBe(100);
});
test("desktop edits preserve hidden objects and tablet can delete them", () => {
	const shadow = makeElement({ type: "text", note: true }),
		ink = makeElement({ type: "line" });
	expect(preserveShadows([{ ...ink, x: 500 }], [shadow, ink])).toEqual([
		shadow,
		{ ...ink, x: 500 },
	]);
	expect(preserveShadows([{ ...shadow, isDeleted: true }], [shadow])).toHaveLength(1);
	expect(preserveShadows([{ ...shadow, isDeleted: true }], [shadow])[0].isDeleted).toBe(true);
});
test("hiding again preserves later edits to public opacity", () => {
	const privateNote = makeElement({ type: "text", note: true, opacity: 80 });
	const changed = { ...setShadow(privateNote, false), opacity: 65 };
	expect(setShadow(setShadow(changed, true), false).opacity).toBe(65);
});
test("invalid privacy metadata and executable references cannot be loaded", () => {
	const note = makeElement({ type: "text", note: true });
	expect(() =>
		validateScene({
			...emptyBoardScene(),
			elements: [{ ...note, customData: { presentation: { shadow: "false" } } }],
		}),
	).toThrow("shadow");
	presentationMeta(note)!.reference = { kind: "script" as "link", id: "evil" };
	expect(() => validateScene({ ...emptyBoardScene(), elements: [note] })).toThrow("reference");
});

test("bound labels and frame children stay private with their parent", () => {
	const frame = makeElement({ type: "rectangle", id: "frame", shadow: true });
	const child = { ...makeElement({ type: "text", text: "Secret label" }), containerId: "frame" };
	expect(visibleElements([frame, child], false)).toEqual([]);
	expect(visibleElements([frame, child], true).map((e) => e.opacity)).toEqual([50, 50]);
	expect(preserveShadows([], [frame, child])).toEqual([frame, child]);
});

test("revealing or hiding one group member changes the whole group and leaves other objects alone", () => {
	const elements = groupObjects(
		[
			makeElement({ type: "text", id: "a", note: true, enter: "fade" }),
			makeElement({ type: "ellipse", id: "b", shadow: true, enter: "spin" }),
			makeElement({ type: "text", id: "other", note: true }),
		],
		{ a: true, b: true },
	);
	const ids = shadowSelectionIds(elements, ["a"]);
	expect([...ids].sort()).toEqual(["a", "b"]);
	const revealed = elements.map((e) =>
		ids.has(e.id) ? setShadow(e, false, undefined, 1000) : e,
	);
	expect(visibleElements(revealed, false).map((e) => e.id)).toEqual(["a", "b"]);
	expect(revealed.slice(0, 2).map((e) => presentationMeta(e)?.revealedAt)).toEqual([1000, 1000]);
	expect(revealed.slice(0, 2).map((e) => presentationMeta(e)?.enter)).toEqual(["fade", "spin"]);
	const hideIds = shadowSelectionIds(revealed, ["b"]);
	expect(
		visibleElements(
			revealed.map((e) => (hideIds.has(e.id) ? setShadow(e, true) : e)),
			false,
		),
	).toEqual([]);
	expect(revealed[2]).toBe(elements[2]);
});
test("nested groups, bound labels and frame contents reveal together without following deleted group members", () => {
	const e = (id: string, groups: string[]) =>
		makeElement({ type: "rectangle", id, groupIds: groups, shadow: true });
	const elements = [
		{ ...e("label", []), containerId: "box" },
		e("box", ["inner", "outer"]),
		e("inner-peer", ["inner", "outer"]),
		e("frame", ["outer"]),
		{ ...e("child", []), frameId: "frame" },
		{ ...e("deleted", ["outer", "different"]), isDeleted: true },
		e("unrelated", ["different"]),
	];
	expect([...shadowSelectionIds(elements, ["label", "missing", "deleted"])].sort()).toEqual([
		"box",
		"child",
		"frame",
		"inner-peer",
		"label",
	]);
});
test("ungrouped and duplicated groups keep independent visibility", () => {
	const grouped = groupObjects(
		[
			makeElement({ type: "text", id: "a", note: true }),
			makeElement({ type: "text", id: "b", note: true }),
		],
		{ a: true, b: true },
	);
	const copies = duplicateObjects(grouped);
	expect([...shadowSelectionIds([...grouped, ...copies], ["a"])].sort()).toEqual(["a", "b"]);
	expect([
		...shadowSelectionIds(groupObjects(grouped, { a: true, b: true }, true), ["a"]),
	]).toEqual(["a"]);
});
