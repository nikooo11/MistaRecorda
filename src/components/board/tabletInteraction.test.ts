import { describe, expect, it } from "vitest";
import { emptyBoardState, type BoardElement } from "../../types/board";
import {
	tabletSceneMode,
	tabletViewport,
	readTabletView,
	withoutTextDraft,
} from "./tabletInteraction";

describe("tablet screen annotations", () => {
	it("follows a hidden overlay and screen-only output instead of retaining the whiteboard", () => {
		const state = emptyBoardState();
		state.mode = "board";
		expect(tabletSceneMode(state)).toBe("screen");
		state.enabled = true;
		expect(tabletSceneMode(state)).toBe("board");
		state.output = "screen";
		expect(tabletSceneMode(state)).toBe("screen");
		state.output = "screen-board";
		state.mode = "screen";
		expect(tabletSceneMode(state)).toBe("screen");
	});
	it("keeps a point under the same streamed pixel after local pinch and pan, without moving Mac ink", () => {
		const scene = { ...emptyBoardState().scenes.screen, zoom: 1.5, scrollX: 10, scrollY: 20 };
		const view = { zoom: 2, x: -40, y: -25 };
		const viewport = tabletViewport(scene, 0.6, view);
		const screenX = (200 + scene.scrollX) * scene.zoom;
		expect((200 + viewport.scrollX) * viewport.zoom).toBeCloseTo(
			(screenX + view.x) * 0.6 * view.zoom,
		);
		expect(readTabletView(scene, 0.6, viewport)).toEqual(view);
		expect(scene.scrollX).toBe(10);
	});
	it("never publishes a new or edited text draft before Done", () => {
		const text = { id: "text", type: "text", version: 1, text: "Published" } as BoardElement;
		const draft = { ...text, version: 2, text: "Private draft" };
		const ink = { id: "ink", type: "freedraw", version: 1 } as BoardElement;
		expect(withoutTextDraft([ink, draft], [ink], "text")).toEqual([ink]);
		expect(withoutTextDraft([ink, draft], [ink, text], "text")).toEqual([ink, text]);
		expect(withoutTextDraft([ink, draft], [ink, text])).toEqual([ink, draft]);
	});
});
