import { expect, test } from "vitest";
import { emptyBoardState } from "../../src/types/board";
import {
	clearMemes,
	dismissMeme,
	memeAtPoint,
	memeSchema,
	placeMeme,
	validateMemes,
	updatePlacedMeme,
} from "./memes";

const asset = () =>
	memeSchema.parse({
		id: crypto.randomUUID(),
		name: "Reaction",
		dataURL: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
		width: 200,
		height: 100,
	});
test("uploaded meme appears immediately, stays three seconds and spins out without sound", () => {
	const a = asset();
	expect(a).toMatchObject({
		enter: "none",
		exit: "spin",
		soundId: "",
		stayUntilClicked: false,
		durationSeconds: 3,
	});
	expect(
		memeSchema.safeParse({ ...a, dataURL: "https://tracker.example/image.png" }).success,
	).toBe(false);
	expect(memeSchema.safeParse({ ...a, dataURL: "data:image/svg+xml;base64,AAAA" }).success).toBe(
		false,
	);
});
test("screen and board memes survive switching and clearing independently", () => {
	const state = emptyBoardState();
	const a = asset();
	state.memes = [a];
	placeMeme(state, { assetId: a.id, mode: "screen", x: 320, y: 90, width: 240 });
	placeMeme(state, { assetId: a.id, mode: "board", x: 44, y: 22, width: 100 });
	expect(state.placedMemes?.screen[0]).toMatchObject({ x: 320, y: 90, width: 240, height: 120 });
	expect(state.placedMemes?.screen[0]).toMatchObject({
		exit: "spin",
		stayUntilClicked: false,
		durationSeconds: 3,
	});
	state.mode = "board";
	clearMemes(state, "board");
	const restored = validateMemes(JSON.parse(JSON.stringify(state)));
	expect(restored.placedMemes.screen).toHaveLength(1);
	expect(restored.placedMemes.board).toHaveLength(0);
	expect(restored.memes).toEqual([a]);
	clearMemes(state, "screen");
	expect(state.memes).toEqual([a]);
});
test("placed transitions are snapshots and expired timed memes do not fill the placement limit", () => {
	const state = emptyBoardState();
	const a = asset();
	a.enter = "spin";
	a.stayUntilClicked = false;
	state.memes = [a];
	placeMeme(state, { assetId: a.id, mode: "board", x: 0, y: 0, width: 100 });
	a.enter = "fade";
	expect(state.placedMemes!.board[0].enter).toBe("spin");
	state.placedMemes!.board[0].placedAt = 0;
	placeMeme(state, { assetId: a.id, mode: "board", x: 10, y: 20, width: 100 });
	expect(state.placedMemes!.board).toHaveLength(1);
	expect(() =>
		placeMeme(state, { assetId: a.id, mode: "board", x: Infinity, y: 0, width: 100 }),
	).toThrow();
});

test("shadow placements never expire or trigger audio before reveal", () => {
	const state = emptyBoardState();
	state.memes = [
		{
			id: "775457fe-1ca6-4c81-a2dd-e0bf49c9d40f",
			name: "Private meme",
			dataURL: "data:image/gif;base64,aGVsbG8=",
			width: 100,
			height: 100,
			enter: "spin",
			exit: "fade",
			stayUntilClicked: false,
			durationSeconds: 1,
			soundId: "61b2f687-14fa-4dca-b47b-6d901cda9980",
			shadow: true,
		},
	];
	const args = { assetId: state.memes[0].id, mode: "board", x: 1, y: 2, width: 100 };
	expect(placeMeme(state, args)).toBe("");
	state.placedMemes!.board[0].placedAt = 1;
	placeMeme(state, args);
	expect(state.placedMemes!.board).toHaveLength(2);
	expect(state.placedMemes!.board.every((m) => m.shadow)).toBe(true);
});

function placed() {
	const state = emptyBoardState();
	const a = asset();
	state.memes = [a];
	placeMeme(state, { assetId: a.id, mode: "screen", x: 100, y: 50, width: 200 });
	const item = state.placedMemes!.screen[0];
	item.placedAt = 1000;
	return { state, item };
}

test("native input is confined to a visible meme at the rendered zoom and scroll", () => {
	const { state, item } = placed();
	state.scenes.screen = { ...state.scenes.screen, zoom: 2, scrollX: -40, scrollY: 10 };
	expect(memeAtPoint(state, 121, 121, 2000)).toBe(item);
	expect(memeAtPoint(state, 519, 319, 2000)).toBe(item);
	expect(memeAtPoint(state, 119, 121, 2000)).toBeUndefined();
	expect(memeAtPoint(state, 521, 121, 2000)).toBeUndefined();
	expect(memeAtPoint(state, 121, 119, 2000)).toBeUndefined();
	expect(memeAtPoint(state, 121, 321, 2000)).toBeUndefined();
});

test("hidden, private, removed and expired memes never block desktop clicks", () => {
	const { state, item } = placed();
	expect(memeAtPoint(state, 150, 80, 3999)).toBe(item);
	expect(memeAtPoint(state, 150, 80, 4000)).toBeUndefined();
	item.stayUntilClicked = true;
	expect(memeAtPoint(state, 150, 80, 90000)).toBe(item);
	item.shadow = true;
	expect(memeAtPoint(state, 150, 80, 2000)).toBeUndefined();
	item.shadow = false;
	item.removedAt = 0;
	expect(memeAtPoint(state, 150, 80, 2000)).toBeUndefined();
	delete item.removedAt;
	state.enabled = false;
	expect(memeAtPoint(state, 150, 80, 2000)).toBeUndefined();
	state.enabled = true;
	state.output = "screen";
	expect(memeAtPoint(state, 150, 80, 2000)).toBeUndefined();
	state.output = "screen-board";
	state.memes = [];
	expect(memeAtPoint(state, 150, 80, 2000)).toBeUndefined();
});

test("hit testing follows the displayed scene and its topmost meme", () => {
	const { state, item } = placed();
	const top = { ...item, id: crypto.randomUUID() };
	state.placedMemes!.screen.push(top);
	expect(memeAtPoint(state, 150, 80, 2000)).toBe(top);
	state.output = "board";
	expect(memeAtPoint(state, 150, 80, 2000)).toBeUndefined();
	state.placedMemes!.board = [item];
	expect(memeAtPoint(state, 150, 80, 2000)).toBe(item);
});

test("dismissal finds placements across scene switches and private whiteboards without restarting exit", () => {
	const { state, item } = placed();
	state.mode = "board";
	const saved = { ...item };
	state.whiteboards = [{ id: "page", name: "Notes", scene: state.scenes.board, memes: [saved] }];
	expect(dismissMeme(state, item.id, 2000)).toBe(true);
	expect(item.removedAt).toBe(2000);
	expect(saved.removedAt).toBe(2000);
	expect(dismissMeme(state, item.id, 2500)).toBe(false);
	expect(item.removedAt).toBe(2000);
	expect(dismissMeme(state, "missing", 3000)).toBe(false);
});

test("live movement preserves aspect and updates saved whiteboard instances", () => {
	const { state, item } = placed();
	item.placedAt = Date.now();
	state.whiteboards = [
		{ id: "page", name: "Board", scene: state.scenes.board, memes: [{ ...item }] },
	];
	updatePlacedMeme(state, { id: item.id, x: 350, y: 175, width: 300, keep: true });
	expect(item).toMatchObject({ x: 350, y: 175, width: 300, height: 150, stayUntilClicked: true });
	expect(state.whiteboards[0].memes[0]).toMatchObject({
		x: 350,
		y: 175,
		width: 300,
		height: 150,
	});
	expect(memeAtPoint(state, 400, 200)).toBe(item);
	dismissMeme(state, item.id);
	expect(() => updatePlacedMeme(state, { id: item.id, x: 500 })).toThrow("left the screen");
});
test("shake preferences are bounded, captured on deploy and private before reveal", () => {
	const state = emptyBoardState(),
		a = asset();
	a.shake = { target: "screen", strength: 10, durationMs: 600 };
	state.memes = [a];
	placeMeme(state, { assetId: a.id, mode: "screen", x: 0, y: 0, width: 240 });
	expect(state.placedMemes!.screen[0].shake).toEqual(a.shake);
	expect(state.placedMemes!.screen[0].shakeAt).toBeGreaterThan(0);
	placeMeme(state, { assetId: a.id, mode: "board", x: 0, y: 0, width: 240, shadow: true });
	expect(state.placedMemes!.board[0].shakeAt).toBeUndefined();
	for (const shake of [
		{ ...a.shake, strength: 100 },
		{ ...a.shake, durationMs: 10000 },
	])
		expect(memeSchema.safeParse({ ...a, shake }).success).toBe(false);
	expect(validateMemes(JSON.parse(JSON.stringify(state))).memes[0].shake).toEqual(a.shake);
});

test("edited playback settings and category survive a saved library round trip", () => {
	const state = emptyBoardState();
	state.memes = [
		{
			...asset(),
			edited: true,
			enter: "fade",
			exit: "fall",
			soundId: "61b2f687-14fa-4dca-b47b-6d901cda9980",
			shake: { target: "screen", strength: 6, durationMs: 500 },
		},
	];
	const restored = validateMemes(JSON.parse(JSON.stringify(state)));
	expect(restored.memes[0]).toEqual(state.memes[0]);
});
