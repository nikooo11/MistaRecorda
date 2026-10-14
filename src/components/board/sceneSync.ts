import type { BoardMode, BoardScene, BoardState } from "../../types/board";
export interface ScenePatch {
	mode: BoardMode;
	scene: BoardScene;
	revision: number;
	tag?: string;
}
export function mergeScenePatch(state: BoardState, patch: ScenePatch): BoardState {
	if (patch.revision < state.revision) return state;
	return {
		...state,
		revision: patch.revision,
		assets: { ...state.assets, ...patch.scene.files },
		scenes: {
			...state.scenes,
			[patch.mode]: {
				...patch.scene,
				files: { ...state.scenes[patch.mode].files, ...patch.scene.files },
			},
		},
	};
}
export function newSceneFiles(scene: BoardScene, known: BoardScene["files"]) {
	return Object.fromEntries(
		Object.entries(scene.files).filter(([id, file]) => known[id]?.dataURL !== file.dataURL),
	);
}
export function sceneSignature(scene: BoardScene) {
	return JSON.stringify([
		scene.elements,
		scene.scrollX,
		scene.scrollY,
		scene.zoom,
		Object.keys(scene.files),
	]);
}
