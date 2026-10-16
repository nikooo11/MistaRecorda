import type { BoardElement, BoardScene, BoardState } from "../../types/board";

export const tabletSceneMode = (state: BoardState) =>
	state.enabled && state.output !== "screen" ? state.mode : "screen";

export type TabletView = { zoom: number; x: number; y: number };
export const fittedTabletView = (): TabletView => ({ zoom: 1, x: 0, y: 0 });

// Tablet navigation magnifies the screen and ink together. It never moves the
// Mac's screen drawing viewport. Whiteboards instead share their navigation.
export function tabletViewport(scene: BoardScene, scale: number, view: TabletView) {
	return {
		scrollX: scene.scrollX + view.x / scene.zoom,
		scrollY: scene.scrollY + view.y / scene.zoom,
		zoom: scene.zoom * scale * view.zoom,
	};
}

export function readTabletView(
	scene: BoardScene,
	scale: number,
	viewport: { scrollX: number; scrollY: number; zoom: number },
): TabletView {
	return {
		zoom: viewport.zoom / (scene.zoom * scale),
		x: (viewport.scrollX - scene.scrollX) * scene.zoom,
		y: (viewport.scrollY - scene.scrollY) * scene.zoom,
	};
}

// A native text editor may be opened by double-tap as well as the Text tool.
// Preserve the committed value while its replacement is still a private draft.
export function withoutTextDraft(
	elements: readonly BoardElement[],
	committed: readonly BoardElement[],
	draftId?: string,
): BoardElement[] {
	if (!draftId) return [...elements];
	const previous = committed.find((element) => element.id === draftId);
	return elements.flatMap((element) =>
		element.id === draftId ? (previous ? [previous] : []) : [element],
	);
}

// Convert the fitted iPad canvas back to the Mac's logical presentation size.
export function publishedViewport(
	scene: BoardScene,
	scale: number,
	viewport: { scrollX: number; scrollY: number; zoom: number },
	privateScreenView: boolean,
) {
	return privateScreenView
		? { scrollX: scene.scrollX, scrollY: scene.scrollY, zoom: scene.zoom }
		: {
				scrollX: viewport.scrollX,
				scrollY: viewport.scrollY,
				zoom: Math.max(0.1, Math.min(10, viewport.zoom / scale)),
			};
}
