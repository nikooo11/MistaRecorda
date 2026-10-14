import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { BoardStore, makeElement, validateScene } from "./store";
import { emptyBoardScene } from "../../src/types/board";
const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});
async function store() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "board-test-"));
	dirs.push(dir);
	return new BoardStore(dir);
}
test("screen and opaque board retain independent drawings and shared viewports across restart", async () => {
	const s = await store();
	s.updateScene(
		"board",
		{
			...emptyBoardScene(),
			elements: [makeElement({ type: "rectangle", id: "a", x: 120, y: 90 })],
			zoom: 1.8,
			scrollX: -40,
		},
		0,
	);
	s.updateScene(
		"screen",
		{ ...emptyBoardScene(), elements: [makeElement({ type: "arrow", id: "b" })] },
		1,
	);
	s.state.enabled = true;
	await s.save();
	const reopened = new BoardStore(s.root);
	await reopened.load();
	expect(reopened.state.enabled).toBe(false);
	expect(reopened.state.scenes.board.zoom).toBe(1.8);
	expect(reopened.state.scenes.board.elements[0].id).toBe("a");
	expect(reopened.state.scenes.screen.elements[0].id).toBe("b");
});
test("concurrent stale edits fail without overwriting a newer scene", async () => {
	const s = await store();
	s.updateScene(
		"board",
		{ ...emptyBoardScene(), elements: [makeElement({ type: "text", text: "Keep me" })] },
		0,
	);
	expect(() => s.updateScene("board", emptyBoardScene(), 0)).toThrow("changed");
	expect(s.state.scenes.board.elements).toHaveLength(1);
});
test("named scenes preserve raster assets and can be loaded after clearing", async () => {
	const s = await store();
	s.state.mode = "board";
	s.updateScene(
		"board",
		{
			...emptyBoardScene(),
			elements: [makeElement({ type: "ellipse" })],
			files: {
				image: {
					id: "image",
					dataURL: "data:image/png;base64,aGVsbG8=",
					mimeType: "image/png",
					created: 1,
				},
			},
		},
		0,
	);
	await s.saveScene("Introduction É");
	s.updateScene("board", emptyBoardScene(), 1);
	await s.loadScene("Introduction É");
	expect(s.state.scenes.board.elements).toHaveLength(1);
	expect(s.state.scenes.board.files.image.dataURL).toContain("aGVsbG8=");
	await expect(s.saveScene("../escape")).rejects.toThrow();
});
test("rejects unsafe external content and invalid geometry before persistence", () => {
	const e = makeElement({ type: "rectangle" });
	expect(() => validateScene({ ...emptyBoardScene(), elements: [{ ...e, x: NaN }] })).toThrow(
		"geometry",
	);
	expect(() =>
		validateScene({ ...emptyBoardScene(), elements: [{ ...e, link: "javascript:alert(1)" }] }),
	).toThrow("links");
	expect(() =>
		validateScene({
			...emptyBoardScene(),
			files: {
				x: {
					id: "x",
					dataURL: "https://example.test/private",
					mimeType: "image/png",
					created: 0,
				},
			},
		}),
	).toThrow();
	expect(() => validateScene({ ...emptyBoardScene(), zoom: 0 })).toThrow("viewport");
});
