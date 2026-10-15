import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// Clear objects and active edits, never the user's tools, colors, palette or
// viewport. resetScene() resets all of those preferences to library defaults.
export function clearCanvas(api: ExcalidrawImperativeAPI) {
	api.updateScene({
		elements: [],
		captureUpdate: "NEVER",
		appState: {
			selectedElementIds: {},
			previousSelectedElementIds: {},
			selectedGroupIds: {},
			editingGroupId: null,
			editingTextElement: null,
			editingLinearElement: null,
			selectedLinearElement: null,
			newElement: null,
			multiElement: null,
			resizingElement: null,
			selectionElement: null,
			startBoundElement: null,
			suggestedBindings: [],
			frameToHighlight: null,
			editingFrame: null,
			elementsToHighlight: null,
			selectedElementsAreBeingDragged: false,
			isResizing: false,
			isRotating: false,
		},
	});
	// A later Undo must not republish objects cleared on another device.
	api.history.clear();
}
