import { expect, test } from "vitest";
import { DEFAULT_CAMERA_LAYOUT } from "../../lib/cameraLayout";
import type { RecordingScene, StudioInfo } from "../../types/studio";
import { isCurrentScene } from "./sceneSelection";
const scene: RecordingScene = {
	id: "a",
	name: "Demo",
	source: { id: "window:1:0", name: "Browser", sourceType: "window" },
	camera: true,
	cameraLayout: DEFAULT_CAMERA_LAYOUT,
	audio: { microphone: true, system: false },
	shortcut: "",
};
const info: StudioInfo = {
	selectedName: "Browser",
	selectedSource: scene.source,
	camera: { enabled: true },
	audio: scene.audio,
	recording: true,
	switching: false,
	canSwitch: true,
	message: "",
	settings: {
		cameraLayout: DEFAULT_CAMERA_LAYOUT,
		cameraShortcut: "",
		windows: [],
		scenes: [scene],
		sounds: [],
		glow: false,
	},
};
test("current scene requires its source, audio and camera layout to match", () => {
	expect(isCurrentScene(scene, info)).toBe(true);
	expect(isCurrentScene(scene, { ...info, audio: { microphone: true, system: true } })).toBe(
		false,
	);
	expect(isCurrentScene(scene, { ...info, camera: { enabled: false } })).toBe(false);
	expect(
		isCurrentScene(scene, {
			...info,
			settings: { ...info.settings, cameraLayout: { ...DEFAULT_CAMERA_LAYOUT, x: 0.2 } },
		}),
	).toBe(false);
	expect(
		isCurrentScene(scene, { ...info, selectedSource: { ...scene.source, id: "window:2:0" } }),
	).toBe(false);
});
