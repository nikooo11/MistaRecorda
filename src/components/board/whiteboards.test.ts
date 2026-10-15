import { describe, expect, it, vi } from "vitest";
import { emptyBoardState, emptyBoardScene, type BoardAPI } from "../../types/board";
import {
	activateWhiteboardPage,
	addWhiteboardPage,
	saveWhiteboardPage,
	whiteboardPages,
	whiteboardView,
} from "./whiteboards";
import { mergeScenePatch } from "./sceneSync";
import { whiteboardTransport } from "./whiteboardTransport";
import { validateWhiteboards } from "../../../electron/board/store";

describe("saved whiteboards", () => {
	it("migrates the existing board without changing its drawing", () => {
		const s = emptyBoardState();
		s.scenes.board.scrollX = 123;
		expect(whiteboardPages(s)[0].scene.scrollX).toBe(123);
		expect(validateWhiteboards(s).activeWhiteboardId).toBe("default");
	});
	it("prepares an inactive board without replacing the live canvas", () => {
		const s = emptyBoardState();
		s.scenes.board.scrollX = 42;
		addWhiteboardPage(s, "second");
		saveWhiteboardPage(s, "second", { ...emptyBoardScene(), scrollX: 99 });
		expect(s.scenes.board.scrollX).toBe(42);
		expect(whiteboardView(s, "second").scenes.board.scrollX).toBe(99);
		expect(s.activeWhiteboardId).toBe("default");
	});
	it("retains edits made while a page was active when switching away and back", () => {
		const s = emptyBoardState();
		addWhiteboardPage(s, "second");
		activateWhiteboardPage(s, "second");
		s.scenes.board = { ...emptyBoardScene(), scrollY: 123 };
		activateWhiteboardPage(s, "default");
		expect(s.scenes.board.scrollY).toBe(0);
		activateWhiteboardPage(s, "second");
		expect(s.scenes.board.scrollY).toBe(123);
	});
	it("keeps screen drawings and inactive tabs when clearing one board", () => {
		const s = emptyBoardState();
		s.scenes.screen.scrollX = 321;
		addWhiteboardPage(s, "second");
		saveWhiteboardPage(s, "second", { ...emptyBoardScene(), scrollX: 8 });
		saveWhiteboardPage(s, "default", emptyBoardScene(), []);
		expect(s.scenes.screen.scrollX).toBe(321);
		expect(whiteboardPages(s)[1].scene.scrollX).toBe(8);
	});
	it("routes inactive patches without changing the Mac or losing source images", () => {
		const s = emptyBoardState();
		addWhiteboardPage(s, "second");
		s.scenes.board.scrollX = 9;
		const next = mergeScenePatch(s, {
			mode: "board",
			whiteboardId: "second",
			revision: 1,
			scene: { ...emptyBoardScene(), scrollX: 7 },
		});
		expect(next.scenes.board.scrollX).toBe(9);
		expect(whiteboardPages(next)[1].scene.scrollX).toBe(7);
	});
	it("rejects invalid names, duplicate ids, missing active pages and excess tabs", () => {
		const s = emptyBoardState();
		addWhiteboardPage(s, "second");
		expect(() => addWhiteboardPage(s, "second")).toThrow();
		expect(() => activateWhiteboardPage(s, "missing")).toThrow();
		expect(() => validateWhiteboards({ ...s, activeWhiteboardId: "missing" })).toThrow();
		s.whiteboards![1].name = "";
		expect(() => validateWhiteboards(s)).toThrow();
		for (let i = 2; i < 20; i++) addWhiteboardPage(s, String(i));
		expect(() => addWhiteboardPage(s, "extra")).toThrow();
	});
});
describe("private iPad whiteboard transport", () => {
	it("tags edits and clears with the chosen tab", async () => {
		const state = emptyBoardState();
		addWhiteboardPage(state, "second");
		const request = vi.fn(async () => ({ revision: 1 }));
		const base = { request, on: () => () => {} } as BoardAPI;
		const t = whiteboardTransport(
			base,
			() => state,
			() => "second",
			() => {},
		);
		await t.request("scene", { mode: "board", revision: 0, scene: emptyBoardScene() });
		expect(request).toHaveBeenLastCalledWith(
			"scene",
			expect.objectContaining({ whiteboardId: "second" }),
		);
		await t.request("clear", { confirmed: true });
		expect(request).toHaveBeenLastCalledWith("clearWhiteboard", {
			confirmed: true,
			whiteboardId: "second",
		});
	});
	it("does not publish private drafts or trigger live-only placement actions", async () => {
		const state = emptyBoardState();
		addWhiteboardPage(state, "second");
		const request = vi.fn();
		const t = whiteboardTransport(
			{ request, on: () => () => {} } as BoardAPI,
			() => state,
			() => "second",
			() => {},
		);
		const view = await t.request("annotate");
		expect(view).toMatchObject({ mode: "board", enabled: true });
		await expect(t.request("placeMeme", {})).rejects.toThrow("Activate this whiteboard");
		expect(request).not.toHaveBeenCalled();
	});
});
