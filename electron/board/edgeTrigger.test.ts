import { expect, test } from "vitest";
import { EdgeBoardTrigger } from "./edgeTrigger";
test("reveals a clickable handle and leaves time to move onto it", () => {
	const trigger = new EdgeBoardTrigger();
	expect(trigger.update(false, true, 0)).toBe(false);
	expect(trigger.update(true, true, 100)).toBe(true);
	expect(trigger.update(false, true, 600)).toBe(true);
	expect(trigger.update(false, true, 800)).toBe(false);
});
test("disabled drawing resets the handle and never opens a board", () => {
	const trigger = new EdgeBoardTrigger();
	trigger.update(true, true, 100);
	expect(trigger.update(true, false, 200)).toBe(false);
	expect(trigger.update(false, true, 300)).toBe(false);
});
