import { expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyBoardState } from "../../src/types/board";
import { emptyPresenterDocument } from "../../src/types/presenter";
import { BoardStore, makeElement } from "./store";
import { PresenterStore } from "./presenter";
import { fitPresentation, validatePresentationBundle } from "./presentationBundle";
import { visibleElements } from "../../src/components/board/shadowObjects";
const id = "775457fe-1ca6-4c81-a2dd-e0bf49c9d40f";
function fixture() {
	const board = emptyBoardState();
	board.scenes.screen.elements = [
		makeElement({ type: "text", id: "private", text: "Private talking point", note: true }),
	];
	board.scenes.board.elements = [makeElement({ type: "ellipse", id: "public" })];
	board.assets.image = {
		id: "image",
		mimeType: "image/png",
		dataURL: "data:image/png;base64,aGVsbG8=",
		created: 1,
	};
	board.memes = [
		{
			id,
			name: "Meme",
			dataURL: "data:image/gif;base64,aGVsbG8=",
			width: 100,
			height: 100,
			enter: "spin",
			exit: "fade",
			stayUntilClicked: true,
			durationSeconds: 5,
			soundId: "",
			shadow: true,
		},
	];
	board.placedMemes!.board = [
		{
			id,
			assetId: id,
			x: 10,
			y: 20,
			width: 100,
			height: 100,
			placedAt: 1,
			enter: "spin",
			exit: "fade",
			stayUntilClicked: true,
			durationSeconds: 5,
			shadow: true,
		},
	];
	const presenter = emptyPresenterDocument();
	presenter.canvasNotes = [{ id, name: "Cue", text: "Remember this" }];
	presenter.notes = { body: "- **Explain** @{Cue}", references: { Cue: { kind: "note", id } } };
	return {
		format: "mistarecorda-presentation",
		version: 1,
		name: "Test",
		board,
		presenter,
		sounds: [],
	};
}
test("portable round trip preserves both canvases, shadows, media and stable references", () => {
	const result = validatePresentationBundle(JSON.parse(JSON.stringify(fixture())));
	expect(result.board.scenes.screen.elements[0].opacity).toBe(50);
	expect(visibleElements(result.board.scenes.screen.elements, false)).toHaveLength(0);
	expect(result.board.scenes.board.elements[0].id).toBe("public");
	expect(result.board.assets.image.dataURL).toContain("base64");
	expect(result.board.placedMemes?.board[0].shadow).toBe(true);
	expect(result.presenter.notes.references.Cue.id).toBe(id);
	expect(result.presenter.canvasNotes?.[0].text).toBe("Remember this");
});
test("imported privacy and reference data survive a real on-disk app restart", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "mista-presentation-"));
	try {
		const bundle = validatePresentationBundle(fixture());
		const board = new BoardStore(root),
			presenter = new PresenterStore(root);
		board.state = { ...board.state, ...bundle.board };
		await board.save();
		await presenter.update("replacePresentation", bundle.presenter);
		const reopened = new BoardStore(root),
			notes = new PresenterStore(root);
		await Promise.all([reopened.load(), notes.load()]);
		expect(visibleElements(reopened.state.scenes.screen.elements, false)).toEqual([]);
		expect(reopened.state.placedMemes?.board[0].shadow).toBe(true);
		expect(notes.state.canvasNotes).toEqual(bundle.presenter.canvasNotes);
		expect(notes.state.notes.references).toEqual(bundle.presenter.notes.references);
		expect(reopened.state.enabled).toBe(process.platform !== "linux");
		expect(reopened.state.mode).toBe("screen");
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
test("invalid import fails before it can replace the existing layout", () => {
	const f = fixture();
	f.board.assets.image.dataURL = "https://untrusted.example/image.png";
	expect(() => validatePresentationBundle(f)).toThrow("PNG");
	const g = fixture();
	g.board.scenes.board.elements.push({
		...makeElement({ type: "rectangle" }),
		type: "image",
		fileId: "missing",
	});
	expect(() => validatePresentationBundle(g)).toThrow("missing image");
	const h = fixture();
	h.board.memes[0].soundId = id;
	expect(() => validatePresentationBundle(h)).toThrow("missing meme sound");
	const i = fixture();
	i.board.library = [
		{
			elements: [
				{
					...makeElement({ type: "rectangle" }),
					type: "embeddable",
					link: "https://example.com",
				},
			],
		},
	];
	expect(() => validatePresentationBundle(i)).toThrow("Embedded");
});
test("uniform display fit preserves aspect, placements and private state", () => {
	const bundle = validatePresentationBundle(fixture());
	const board = fitPresentation(bundle.board, 1920, 1200);
	expect(board.scenes.board.zoom).toBe(1.5);
	expect(board.scenes.board.scrollY).toBe(40);
	expect(board.scenes.screen.elements[0].opacity).toBe(50);
	expect(board.placedMemes?.board[0].width).toBe(100);
});

test("presentation round trip retains inactive whiteboard assets, geometry and independent memes", async () => {
	const { addWhiteboardPage, saveWhiteboardPage, activateWhiteboardPage } = await import(
		"../../src/components/board/whiteboards"
	);
	const f = fixture();
	addWhiteboardPage(f.board, "second");
	saveWhiteboardPage(
		f.board,
		"second",
		{
			...f.board.scenes.board,
			elements: [
				{
					...makeElement({ type: "rectangle", id: "picture" }),
					type: "image",
					fileId: "privateImage",
				},
			],
			files: {
				privateImage: {
					id: "privateImage",
					mimeType: "image/png",
					dataURL: "data:image/png;base64,YQ==",
					created: 1,
				},
			},
		},
		f.board.placedMemes!.board,
	);
	const bundle = validatePresentationBundle(JSON.parse(JSON.stringify(f)));
	expect(bundle.board.assets.privateImage).toBeDefined();
	const page = bundle.board.whiteboards![1];
	expect(page.memes[0].assetId).toBe(id);
	fitPresentation(bundle.board, 1920, 1200);
	expect(page.scene.zoom).toBe(1.5);
	const state = { ...emptyBoardState(), ...bundle.board };
	activateWhiteboardPage(state, "second");
	expect(state.scenes.board.zoom).toBe(1.5);
	expect(state.scenes.board.elements[0].fileId).toBe("privateImage");
});

test("inactive whiteboards reject missing meme assets", async () => {
	const { addWhiteboardPage, saveWhiteboardPage } = await import(
		"../../src/components/board/whiteboards"
	);
	const f = fixture();
	addWhiteboardPage(f.board, "second");
	saveWhiteboardPage(f.board, "second", f.board.scenes.board, [
		{ ...f.board.placedMemes!.board[0], assetId: "00000000-0000-4000-8000-000000000000" },
	]);
	expect(() => validatePresentationBundle(f)).toThrow("missing meme");
});

test("private PDFs and multiple note sets round-trip with integrity checks", async () => {
	const { createHash } = await import("node:crypto");
	const raw = fixture();
	const bytes = Buffer.from("%PDF-1.7\nprivate presentation fixture");
	raw.presenter.pdfs = [
		{
			id,
			name: "Private reference.pdf",
			pages: 2,
			hash: createHash("sha256").update(bytes).digest("hex"),
		},
	];
	raw.presenter.noteSets = [
		{ id: "original", name: "First", notes: raw.presenter.notes },
		{ id: "second", name: "Second", notes: { body: "Private second notes", references: {} } },
	];
	raw.presenter.activeSetId = "second";
	const bundle = { ...raw, privatePDFs: { [id]: bytes.toString("base64") } };
	const parsed = validatePresentationBundle(JSON.parse(JSON.stringify(bundle)));
	expect(parsed.presenter.noteSets?.[1].notes.body).toBe("Private second notes");
	expect(parsed.privatePDFs?.[id]).toBe(bytes.toString("base64"));
	expect(() => validatePresentationBundle({ ...bundle, privatePDFs: {} })).toThrow();
	expect(() =>
		validatePresentationBundle({
			...bundle,
			privatePDFs: { [id]: Buffer.from("%PDF-tampered").toString("base64") },
		}),
	).toThrow("damaged");
});
