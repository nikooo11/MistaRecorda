import { randomUUID } from "node:crypto";
import { defaultEnvironmentAudio } from "../../src/components/studio/environmentAudio";
import type { StudioSettings } from "../../src/types/studio";

type Scene = StudioSettings["scenes"][number];
type Display = { id: string; name: string; display_id?: string };

/** A screen-sharing presentation scene: full display, mic and computer audio on, no facecam. */
export function presentationScene(
	display: Display,
	cameraLayout: StudioSettings["cameraLayout"],
): Scene {
	return {
		id: randomUUID(),
		name: "Presentation",
		source: {
			id: display.id,
			name: display.name || "Entire screen",
			display_id: display.display_id || undefined,
			sourceType: "screen",
		},
		camera: false,
		audio: { ...defaultEnvironmentAudio },
		cameraLayout,
		shortcut: "",
		media: [],
	};
}

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
