import { expect, it, vi } from "vitest";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { clearCanvas } from "./clearCanvas";

it("clears ink and interrupted edits while retaining the chosen tools and navigation", () => {
	const preferences = {
		currentItemStrokeColor: "#e03131",
		currentItemBackgroundColor: "#ffc9c9",
		currentItemStrokeWidth: 4,
		currentItemOpacity: 75,
		currentItemFontSize: 28,
		activeTool: { type: "freedraw", locked: true },
		penMode: false,
		penDetected: true,
		zoom: { value: 1.83 },
		scrollX: -420,
		scrollY: -190,
	};
	let view = { ...preferences, selectedElementIds: { ink: true }, newElement: { id: "ink" } };
	let elements: unknown[] = [{ id: "ink" }];
	const history = { clear: vi.fn() };
	const updateScene = vi.fn((update) => {
		view = { ...view, ...update.appState };
		elements = update.elements;
	});
	clearCanvas({ updateScene, history } as unknown as ExcalidrawImperativeAPI);
	expect(elements).toEqual([]);
	expect(view).toMatchObject(preferences);
	expect(view.selectedElementIds).toEqual({});
	expect(view.newElement).toBeNull();
	expect(history.clear).toHaveBeenCalledOnce();
	expect(updateScene.mock.calls[0][0].captureUpdate).toBe("NEVER");
});
