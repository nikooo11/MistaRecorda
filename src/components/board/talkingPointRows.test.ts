import { expect, test } from "vitest";
import { editTalkingPoint, referenceTap, talkingPointRows } from "./talkingPointRows";
import type { TalkingNotes } from "../../types/presenter";
const notes: TalkingNotes = {
	body: "- Intro\n- Evidence @{Chart}\n- Closing",
	references: { Chart: { kind: "chart", id: "one" } },
};
test("covered status follows reordered points and references remain stable", () => {
	const covered = editTalkingPoint(notes, 1, "covered");
	const moved = editTalkingPoint(covered, 1, "up");
	expect(moved.body).toBe("- Evidence @{Chart}\n- Intro\n- Closing");
	expect(talkingPointRows(moved).map((p) => p.covered)).toEqual([true, false, false]);
	expect(moved.references).toEqual(notes.references);
	expect(editTalkingPoint(moved, 0, "up")).toBe(moved);
});
test("edited text resets its check while unchanged and repeated points preserve separate state", () => {
	let n: TalkingNotes = { body: "Same\nSame", references: {} };
	n = editTalkingPoint(n, 1, "covered");
	expect(talkingPointRows(n).map((p) => p.covered)).toEqual([false, true]);
	expect(talkingPointRows({ ...n, body: "New\nSame\nSame" }).map((p) => p.covered)).toEqual([
		false,
		false,
		true,
	]);
});
test("first tap and changing references only stage; repeat tap deploys", () => {
	expect(referenceTap(undefined, "sound:a")).toBe("stage");
	expect(referenceTap("sound:a", "image:a")).toBe("stage");
	expect(referenceTap("sound:a", "sound:a")).toBe("deploy");
});
