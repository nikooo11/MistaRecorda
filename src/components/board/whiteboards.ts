import {
	emptyBoardScene,
	type BoardScene,
	type BoardState,
	type WhiteboardPage,
} from "../../types/board";

export function whiteboardPages(state: BoardState): WhiteboardPage[] {
	const pages = state.whiteboards?.length
		? state.whiteboards
		: [
				{
					id: "default",
					name: "Whiteboard 1",
					scene: state.scenes.board,
					memes: state.placedMemes?.board ?? [],
				},
			];
	const active = state.activeWhiteboardId ?? pages[0].id;
	return pages.map((p) =>
		p.id === active
			? { ...p, scene: state.scenes.board, memes: state.placedMemes?.board ?? [] }
			: { ...p },
	);
}
export function whiteboardView(state: BoardState, id: string | null): BoardState {
	if (!id) return state;
	const page = whiteboardPages(state).find((p) => p.id === id);
	if (!page) return state;
	return {
		...state,
		enabled: true,
		mode: "board",
		output: "screen-board",
		scenes: { ...state.scenes, board: page.scene },
		placedMemes: { screen: state.placedMemes?.screen ?? [], board: page.memes },
	};
}
export function saveWhiteboardPage(
	state: BoardState,
	id: string,
	scene: BoardScene,
	memes?: WhiteboardPage["memes"],
) {
	const pages = whiteboardPages(state);
	const page = pages.find((p) => p.id === id);
	if (!page) throw Error("This whiteboard no longer exists.");
	page.scene = scene;
	if (memes) page.memes = memes;
	state.whiteboards = pages;
	state.activeWhiteboardId ??= pages[0].id;
	if (state.activeWhiteboardId === id) {
		state.scenes.board = scene;
		state.placedMemes = { screen: state.placedMemes?.screen ?? [], board: page.memes };
	}
}
export function addWhiteboardPage(state: BoardState, id: string) {
	const pages = whiteboardPages(state);
	if (pages.length >= 20) throw Error("Up to 20 whiteboards can be saved in one environment.");
	if (pages.some((p) => p.id === id)) throw Error("Duplicate whiteboard ID.");
	state.activeWhiteboardId ??= pages[0].id;
	state.whiteboards = [
		...pages,
		{ id, name: `Whiteboard ${pages.length + 1}`, scene: emptyBoardScene(), memes: [] },
	];
}
export function activateWhiteboardPage(state: BoardState, id: string) {
	const pages = whiteboardPages(state);
	const page = pages.find((p) => p.id === id);
	if (!page) throw Error("This whiteboard no longer exists.");
	state.whiteboards = pages;
	state.activeWhiteboardId = id;
	state.scenes.board = page.scene;
	state.placedMemes = { screen: state.placedMemes?.screen ?? [], board: page.memes };
}
