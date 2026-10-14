import { describe, it, expect } from "vitest";
import { makeElement } from "../../../electron/board/store";
import { duplicateObjects, groupObjects, selectedObjects, hitObject } from "./objectEditing";
describe("touch object editing", () => {
	it("duplicates groups and bound text without linking to originals", () => {
		const box = {
			...makeElement({ type: "rectangle", id: "box", groupIds: ["group"] }),
			boundElements: [{ id: "text", type: "text" }],
		};
		const text = {
			...makeElement({ type: "text", id: "text", groupIds: ["group"] }),
			containerId: "box",
		};
		const selected = selectedObjects([box, text], { box: true });
		const copy = duplicateObjects(selected);
		expect(copy).toHaveLength(2);
		expect(copy[0].id).not.toBe("box");
		expect(copy[1].containerId).toBe(copy[0].id);
		expect(copy[0].boundElements).toEqual([{ id: copy[1].id, type: "text" }]);
		expect(copy[0].groupIds).toEqual(copy[1].groupIds);
		expect(copy[0].groupIds).not.toEqual(["group"]);
		expect(copy[0].x).toBe(24);
		expect(box.x).toBe(0);
	});
	it("groups only selected independent strokes and can ungroup them", () => {
		const strokes = ["a", "b", "c"].map((id) => makeElement({ id, type: "freedraw" }));
		const grouped = groupObjects(strokes, { a: true, b: true });
		expect(grouped[0].groupIds).toEqual(grouped[1].groupIds);
		expect(grouped[2].groupIds).toEqual([]);
		expect(groupObjects(grouped, { a: true, b: true }, true).map((e) => e.groupIds)).toEqual([
			[],
			[],
			[],
		]);
	});
	it("hits the topmost unlocked object and ignores deleted objects", () => {
		const a = makeElement({ type: "rectangle" });
		const b = { ...a, id: "b", isDeleted: true };
		expect(hitObject([a, b], 10, 10)?.id).toBe(a.id);
		expect(hitObject([a], 500, 500)).toBeUndefined();
	});
});
