import type { StudioSettings, StudioSource } from "../../src/types/studio";

/** Seed once, so deleting a scene or returning to the studio never recreates it. */
export function withStarterScene(settings: StudioSettings, screen: StudioSource): StudioSettings {
	if (settings.starterSceneCreated) return settings;
	if (settings.scenes.length) return { ...settings, starterSceneCreated: true };
	return {
		...settings,
		starterSceneCreated: true,
		scenes: [
			{
				id: crypto.randomUUID(),
				name: "Screen explainer",
				source: screen,
				camera: true,
				cameraLayout: {
					...settings.cameraLayout,
					borderWidth: 0.7,
					borderColor: "#e8edf2",
					shadow: 0.25,
				},
				audio: { microphone: true, system: true },
				media: [],
				shortcut: "",
			},
		],
	};
}
