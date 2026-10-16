import type { StudioSettings } from "../../src/types/studio";

type Scene = StudioSettings["scenes"][number];

/** Prefer a saved scene that shares the drawing display, so the board can record it. */
export function launchScene(scenes: Scene[], boardDisplayId: string) {
	return (
		scenes.find(
			(s) => s.source.sourceType === "screen" && s.source.display_id === boardDisplayId,
		) ??
		scenes.find((s) => s.source.sourceType === "screen") ??
		scenes[0]
	);
}
