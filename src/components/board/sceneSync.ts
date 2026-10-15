import type { BoardMode, BoardScene, BoardState } from "../../types/board";
import { whiteboardPages } from "./whiteboards";
export interface ScenePatch {
	whiteboardId?: string;
	mode: BoardMode;
	scene: BoardScene;
	revision: number;
	tag?: string;
}
export function mergeScenePatch(state: BoardState, patch: ScenePatch): BoardState {
	if (patch.revision < state.revision) return state;
	if (
		patch.mode === "board" &&
		patch.whiteboardId &&
		patch.whiteboardId !== (state.activeWhiteboardId ?? "default")
	) {
		return {
			...state,
			revision: patch.revision,
			assets: { ...state.assets, ...patch.scene.files },
			whiteboards: whiteboardPages(state).map((p) =>
				p.id === patch.whiteboardId
					? {
							...p,
							scene: {
								...patch.scene,
								files: { ...p.scene.files, ...patch.scene.files },
							},
						}
					: p,
			),
		};
	}
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
