import { expect, test } from "vitest";
import { emptyBoardState } from "../../src/types/board";
import { clearMemes, memeSchema, placeMeme, validateMemes } from "./memes";

const asset = () =>
	memeSchema.parse({
		id: crypto.randomUUID(),
		name: "Reaction",
		dataURL: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
		width: 200,
		height: 100,
	});
test("uploaded meme defaults to no transitions, no sound and stays until dismissed", () => {
	const a = asset();
	expect(a).toMatchObject({ enter: "none", exit: "none", soundId: "", stayUntilClicked: true });
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
