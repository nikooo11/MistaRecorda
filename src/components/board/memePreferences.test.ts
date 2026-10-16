import { expect, test } from "vitest";
import { emptyBoardState } from "../../types/board";
import { DEFAULT_MEME_PLAYBACK, type MemeAsset } from "../../types/memes";
import { bundledMemes, bundledMemeURL } from "../../lib/bundledMemes";
import { isEditedMeme, matchingMemes, mergeMemeLibraries } from "./memePreferences";
const original = (): MemeAsset => ({
	...bundledMemes[0],
	...DEFAULT_MEME_PLAYBACK,
	dataURL: bundledMemeURL(bundledMemes[0].asset),
});
test("default audio is not an edit, but saved and legacy custom effects are", () => {
	expect(isEditedMeme(original())).toBe(false);
	expect(isEditedMeme({ ...original(), edited: true })).toBe(true);
	expect(isEditedMeme({ ...original(), soundId: "" })).toBe(true);
	expect(isEditedMeme({ ...original(), enter: "fade" })).toBe(true);
});
test("edited category filters search without losing reusable settings on import", () => {
	const meme = { ...original(), edited: true, name: "My intro", enter: "fade" as const };
	const state = { ...emptyBoardState(), memes: [original(), { ...meme, id: "custom" }] };
	expect(matchingMemes(state, "intro", "edited")).toEqual([state.memes[1]]);
	expect(matchingMemes(state, "missing", "edited")).toEqual([]);
	expect(mergeMemeLibraries([meme], [original()])[0]).toEqual(meme);
});
