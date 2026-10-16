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
	expect(reopened.state.enabled).toBe(process.platform !== "linux");
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

test("standby images survive clearing, saved scene reload and app restart", async () => {
	const s = await store();
	const file = {
		id: "still",
		dataURL: "data:image/png;base64,aGVsbG8=",
		mimeType: "image/png",
		created: 1,
		name: "Screen still",
	};
	s.updateScene("screen", { ...emptyBoardScene(), files: { still: file } }, 0);
	s.state.mode = "screen";
	await s.saveScene("Before clearing");
	s.updateScene("screen", emptyBoardScene(), 1);
	expect(s.state.assets.still).toEqual(file);
	await s.save();
	const reopened = new BoardStore(s.root);
	await reopened.load();
	expect(reopened.state.scenes.screen.elements).toEqual([]);
	expect(reopened.state.assets.still).toEqual(file);
	reopened.state.assets = {};
	await reopened.loadScene("Before clearing");
	expect(reopened.state.assets.still).toEqual(file);
});

test("stroke deltas retain existing image data and reject edits predating clear", async () => {
	const s = await store();
	s.updateScene(
		"screen",
		{
			...emptyBoardScene(),
			files: {
				a: {
					id: "a",
					dataURL: "data:image/png;base64,YQ==",
					mimeType: "image/png",
					created: 1,
				},
			},
		},
		0,
	);
	const image = s.state.scenes.screen.files.a;
	const gallery = s.state.assets;
	s.updateScene(
		"screen",
		{ ...emptyBoardScene(), elements: [makeElement({ type: "freedraw", id: "stroke" })] },
		1,
		true,
	);
	expect(s.state.scenes.screen.files.a).toBe(image);
	expect(s.state.assets).toBe(gallery);
	s.updateScene("screen", emptyBoardScene(), 2);
	expect(() =>
		s.updateScene(
			"screen",
			{ ...emptyBoardScene(), elements: [makeElement({ type: "rectangle" })] },
			2,
			true,
		),
	).toThrow("board changed");
	expect(s.state.scenes.screen.elements).toHaveLength(0);
});

test("whiteboard tabs keep independent drawings and media across disk restart and activation", async () => {
	const { addWhiteboardPage, saveWhiteboardPage, activateWhiteboardPage, whiteboardPages } =
		await import("../../src/components/board/whiteboards");
	const s = await store();
	s.state.scenes.board.elements = [makeElement({ type: "ellipse", id: "first" })];
	addWhiteboardPage(s.state, "second");
	saveWhiteboardPage(s.state, "second", {
		...emptyBoardScene(),
		elements: [makeElement({ type: "rectangle", id: "second-ink" })],
		files: {
			privateImage: {
				id: "privateImage",
				dataURL: "data:image/png;base64,YQ==",
				mimeType: "image/png",
				created: 1,
			},
		},
	});
	await s.save();
	const reopened = new BoardStore(s.root);
	await reopened.load();
	expect(reopened.state.scenes.board.elements[0].id).toBe("first");
	expect(reopened.state.assets.privateImage).toBeDefined();
	activateWhiteboardPage(reopened.state, "second");
	expect(reopened.state.scenes.board.elements[0].id).toBe("second-ink");
	expect(whiteboardPages(reopened.state)[0].scene.elements[0].id).toBe("first");
	await reopened.save();
	const again = new BoardStore(s.root);
	await again.load();
	expect(again.state.activeWhiteboardId).toBe("second");
	expect(again.state.scenes.board.files.privateImage).toBeDefined();
});

test("drawing visibility defaults on, persists an explicit off choice and never reopens the whiteboard at launch", async () => {
	const s = await store();
	expect(s.state.enabled).toBe(process.platform !== "linux");
	s.state.enabled = false;
	s.state.mode = "board";
	await s.save();
	const next = new BoardStore(s.root);
	await next.load();
	expect(next.state.enabled).toBe(false);
	expect(next.state.mode).toBe("screen");
});
test("launch starts with blank drawings and one whiteboard, keeping a backup", async () => {
	const s = await store();
	s.updateScene(
		"screen",
		{ ...emptyBoardScene(), elements: [makeElement({ type: "arrow", id: "b" })] },
		0,
	);
	s.state.whiteboards = [
		{ id: "one", name: "Lesson", scene: emptyBoardScene(), memes: [] },
		{ id: "two", name: "Whiteboard 2", scene: emptyBoardScene(), memes: [] },
	];
	s.state.activeWhiteboardId = "one";
	s.updateScene(
		"board",
		{ ...emptyBoardScene(), elements: [makeElement({ type: "rectangle", id: "a" })] },
		1,
	);
	await s.save();
	const reopened = new BoardStore(s.root);
	await reopened.load();
	expect(await reopened.startClean()).toBe(true);
	expect(reopened.state.scenes.screen.elements).toEqual([]);
	expect(reopened.state.scenes.board.elements).toEqual([]);
	expect(reopened.state.whiteboards).toMatchObject([{ id: "default", name: "Whiteboard 1" }]);
	const backup = JSON.parse(await fs.readFile(path.join(s.root, "board.previous.json"), "utf8"));
	expect(backup.scenes.screen.elements[0].id).toBe("b");
	const again = new BoardStore(s.root);
	await again.load();
	expect(again.state.scenes.screen.elements).toEqual([]);
	expect(await again.startClean()).toBe(false);
});
