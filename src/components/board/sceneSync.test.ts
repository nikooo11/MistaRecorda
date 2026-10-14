import { test, expect } from "vitest";
import { emptyBoardState, emptyBoardScene } from "../../types/board";
import { mergeScenePatch, newSceneFiles, sceneSignature } from "./sceneSync";
const image = { id: "a", dataURL: "data:image/png;base64,YQ==", mimeType: "image/png", created: 1 };
test("stroke patches omit known images but preserve them on both canvases", () => {
	const state = emptyBoardState();
	state.scenes.screen.files = { a: image };
	state.assets = { a: image };
	const scene = {
		...emptyBoardScene(),
		elements: [{ id: "ink", type: "freedraw", version: 1 }],
		files: { a: image },
	};
	const files = newSceneFiles(scene, state.scenes.screen.files);
	expect(files).toEqual({});
	const next = mergeScenePatch(state, {
		mode: "screen",
		scene: { ...scene, files },
		revision: 1,
	});
	expect(next.scenes.screen.files.a).toEqual(image);
	expect(next.assets.a).toEqual(image);
	expect(next.scenes.screen.elements).toHaveLength(1);
	expect(sceneSignature(scene)).not.toContain(image.dataURL);
});
test("a delayed pre-clear update cannot resurrect drawings", () => {
	const state = { ...emptyBoardState(), revision: 9 };
	const stale = {
		mode: "screen" as const,
		scene: { ...emptyBoardScene(), elements: [{ id: "old", type: "freedraw", version: 1 }] },
		revision: 8,
	};
	expect(mergeScenePatch(state, stale)).toBe(state);
	expect(state.scenes.screen.elements).toHaveLength(0);
});
