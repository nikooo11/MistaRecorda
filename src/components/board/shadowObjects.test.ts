import { expect, test } from "vitest";
import { emptyBoardScene } from "../../types/board";
import { makeElement, validateScene } from "../../../electron/board/store";
import {
	isShadow,
	presentationMeta,
	preserveShadows,
	setShadow,
	visibleElements,
} from "./shadowObjects";

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
