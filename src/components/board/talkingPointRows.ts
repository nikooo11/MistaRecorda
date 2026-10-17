import type { TalkingNotes, TalkingPoint } from "../../types/presenter";

/** Body remains the compatible Markdown projection used by the AI planner/MCP. */
export function talkingPointRows(notes: TalkingNotes): TalkingPoint[] {
	const available = [...(notes.points ?? [])];
	return notes.body.split("\n").map((text, index) => {
		const match = available.findIndex((p) => p.text === text);
		const previous = match < 0 ? undefined : available.splice(match, 1)[0];
		return previous ?? { id: `line-${index}`, text, covered: false };
	});
}
export function editTalkingPoint(
	notes: TalkingNotes,
	index: number,
	action: "covered" | "up" | "down",
): TalkingNotes {
	const points = talkingPointRows(notes).map((p, i) => ({ ...p, id: `point-${i}` }));
	if (!points[index]) return notes;
	if (action === "covered") points[index].covered = !points[index].covered;
	else {
		const to = index + (action === "up" ? -1 : 1);
		if (to < 0 || to >= points.length) return notes;
		[points[index], points[to]] = [points[to], points[index]];
	}
	return { ...notes, points, body: points.map((p) => p.text).join("\n") };
}
export function referenceTap(armed: string | undefined, next: string): "stage" | "deploy" {
	return armed === next ? "deploy" : "stage";
}
