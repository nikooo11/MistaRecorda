import { expect, test } from "vitest";
import { makeElement, validateScene } from "../../../electron/board/store";
import { emptyBoardScene } from "../../types/board";
import { exitingImages, removeImage } from "./imageRemoval";
import { presentationMeta, setShadow } from "./shadowObjects";
import { hitObject } from "./objectEditing";

test("remove saves a tombstone immediately while both displays play the outro", () => {
	const original = {
		...makeElement({ type: "rectangle", x: 10, y: 20, width: 120, height: 90 }),
		type: "image",
	};
	const removed = removeImage(original, true, 1000);
	expect(removed.isDeleted).toBe(true);
	expect(presentationMeta(removed)?.exit).toBe("spin");
	for (const tablet of [false, true]) {
		expect(exitingImages([removed], tablet, 1225)).toEqual([removed]);
		expect(exitingImages([removed], tablet, 1450)).toEqual([]);
	}
	expect(hitObject([removed], 60, 60)).toBeUndefined();
	expect(original.isDeleted).not.toBe(true);
	const saved = validateScene({ ...emptyBoardScene(), elements: [removed] });
	expect(exitingImages(saved.elements, false, 2000)).toEqual([]);
});
test("delete bypasses animation, and private images never leak through an outro", () => {
	const image = { ...makeElement({ type: "rectangle" }), type: "image" };
	expect(exitingImages([removeImage(image, false, 1000)], true, 1100)).toEqual([]);
	const shadow = removeImage(setShadow(image, true), true, 1000);
	expect(exitingImages([shadow], false, 1100)).toEqual([]);
	expect(exitingImages([shadow], true, 1100)).toEqual([shadow]);
});
test("saved exit choice is respected and malformed timing is rejected", () => {
	const image = { ...makeElement({ type: "rectangle" }), type: "image" };
	const removed = removeImage(image, true, 1000);
	const meta = presentationMeta(removed)!;
	meta.exit = "none";
	expect(exitingImages([removed], true, 1100)).toEqual([]);
	meta.removedAt = Number.NaN;
	expect(() => validateScene({ ...emptyBoardScene(), elements: [removed] })).toThrow();
});
