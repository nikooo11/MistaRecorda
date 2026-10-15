import { afterEach, expect, test } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { bundledMemes, bundledMemeURL } from "../../src/lib/bundledMemes";
import { emptyBoardState } from "../../src/types/board";
import { emptyPresenterDocument } from "../../src/types/presenter";
import { seedDefaultMemes } from "./defaultMemes";
import { BoardStore } from "./store";
import { gifSize } from "./gifSize";
import { memeSchema, placeMeme } from "./memes";
import { validatePresentationBundle } from "./presentationBundle";
import {
	finishMemeTake,
	matchingMemes,
	mergeMemeLibraries,
	sortedMemes,
} from "../../src/components/board/memePreferences";
const assets = path.resolve("public/assets/memes/starter-v1");
const dirs: string[] = [];
afterEach(async () => {
	for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});
async function directory() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mista-default-memes-"));
	dirs.push(dir);
	return dir;
}

test("all 25 bundled GIFs are intact, tagged, and only Fahhh has audio", async () => {
	expect(bundledMemes).toHaveLength(25);
	expect(new Set(bundledMemes.map((m) => m.id)).size).toBe(25);
	for (const m of bundledMemes) {
		const bytes = await fs.readFile(path.join(assets, m.asset));
		expect(createHash("sha256").update(bytes).digest("hex")).toBe(m.sha256);
		expect(gifSize(bytes)).toEqual({ width: m.width, height: m.height });
		expect(m.tags.length).toBeGreaterThanOrEqual(8);
		expect(m.description.length).toBeGreaterThan(20);
	}
	const state = await seedDefaultMemes(emptyBoardState(), assets);
	expect(state.memes?.filter((m) => m.soundId).map((m) => m.name)).toEqual(["Fahhh"]);
	expect(state.memes?.[0].soundId).toBe("8c4c2b71-3d8a-41f5-9a42-000000000001");
	expect(JSON.stringify(state).length).toBeLessThan(40_000);
	expect(
		state.memes?.every((m) => m.enter === "none" && m.exit === "none" && m.stayUntilClicked),
	).toBe(true);
	expect(
		placeMeme(state, { assetId: state.memes![0].id, mode: "screen", x: 1, y: 1, width: 250 }),
	).toBe(state.memes![0].soundId);
	state.memes![0].soundId = "";
	expect(
		placeMeme(state, { assetId: state.memes![0].id, mode: "screen", x: 1, y: 1, width: 250 }),
	).toBe("");
});
test("restart and explicit restore preserve names, audio removal, loves and favorite choices", async () => {
	const store = new BoardStore(await directory());
	store.state = await seedDefaultMemes(store.state, assets);
	const [fahhh, removed] = store.state.memes!;
	fahhh.name = "My Fahhh";
	fahhh.soundId = "";
	fahhh.loved = true;
	fahhh.tags = ["my reaction"];
	store.state.favoriteMemeIds = [fahhh.id];
	store.state.memes = store.state.memes!.filter((m) => m.id !== removed.id);
	await store.save();
	const reopened = new BoardStore(store.root);
	await reopened.load();
	const unchanged = await seedDefaultMemes(reopened.state, assets);
	expect(unchanged).toBe(reopened.state);
	expect(unchanged.memes).toHaveLength(24);
	const restored = await seedDefaultMemes(unchanged, assets, true);
	expect(restored.memes).toHaveLength(25);
	expect(restored.memes?.find((m) => m.id === fahhh.id)).toMatchObject({
		name: "My Fahhh",
		soundId: "",
		loved: true,
		tags: ["my reaction"],
	});
	expect(restored.favoriteMemeIds).toEqual([fahhh.id]);
	expect(restored.memes?.some((m) => m.id === removed.id)).toBe(true);
});
test("default seeding respects capacity and rejects missing/damaged assets without changing state", async () => {
	const initial = emptyBoardState();
	await expect(seedDefaultMemes(initial, await directory())).rejects.toThrow();
	expect(initial.memes).toEqual([]);
	const full = await seedDefaultMemes(initial, assets);
	full.memes = Array.from({ length: 60 }, () => ({ ...full.memes![0], id: crypto.randomUUID() }));
	await expect(seedDefaultMemes(full, assets, true)).rejects.toThrow("60 maximum");
	expect((await seedDefaultMemes(full, assets)).memes).toHaveLength(60);
});
test("only exact bundled references are allowed; tags normalize and searchable synonyms find reactions", async () => {
	const state = await seedDefaultMemes(emptyBoardState(), assets);
	const m = state.memes![0];
	for (const url of [
		"https://example.com/meme.gif",
		"assets/memes/starter-v1/../secret.gif",
		bundledMemeURL(bundledMemes[0].asset) + "evil",
		"assets/memes/starter-v1/unknown.gif",
	])
		expect(memeSchema.safeParse({ ...m, dataURL: url }).success).toBe(false);
	expect(memeSchema.parse({ ...m, tags: [" Really ", "really", "STUPID"] }).tags).toEqual([
		"really",
		"stupid",
	]);
	expect(matchingMemes(state, "STUPID").map((m) => m.name)).toContain("Seriously");
	expect(matchingMemes(state, "are you kidding").map((m) => m.name)).toContain("Seriously");
	expect(matchingMemes(state, "impossible-search-phrase")).toEqual([]);
});
test("loves sort globally; preparation favorites survive start/pause but reset after stop", async () => {
	const state = await seedDefaultMemes(emptyBoardState(), assets);
	const [first, second, third] = state.memes!;
	third.loved = true;
	state.favoriteMemeIds = [second.id];
	expect(
		sortedMemes(state)
			.slice(0, 3)
			.map((m) => m.id),
	).toEqual([third.id, second.id, first.id]);
	expect(finishMemeTake(state, false, true)).toBe(false);
	expect(finishMemeTake(state, true, true)).toBe(false);
	expect(state.favoriteMemeIds).toEqual([second.id]);
	expect(finishMemeTake(state, true, false)).toBe(true);
	expect(state.favoriteMemeIds).toEqual([]);
	expect(third.loved).toBe(true);
});
test("saved environment carries favorites while importing cannot replace personal loves", async () => {
	const state = await seedDefaultMemes(emptyBoardState(), assets);
	state.memes![0].soundId = "";
	state.memes![0].loved = true;
	state.favoriteMemeIds = [state.memes![1].id];
	const bundle = validatePresentationBundle(
		JSON.parse(
			JSON.stringify({
				format: "mistarecorda-presentation",
				version: 1,
				name: "Test",
				board: state,
				presenter: emptyPresenterDocument(),
				sounds: [],
			}),
		),
	);
	expect(bundle.board.favoriteMemeIds).toEqual(state.favoriteMemeIds);
	expect(bundle.board.memes?.[0].dataURL).toBe(bundledMemeURL(bundledMemes[0].asset));
	const other = { ...state.memes![2], id: crypto.randomUUID(), loved: true };
	const merged = mergeMemeLibraries(state.memes!, [{ ...state.memes![0], loved: false }, other]);
	expect(merged.find((m) => m.id === state.memes![0].id)?.loved).toBe(true);
	expect(merged.find((m) => m.id === other.id)?.loved).toBe(false);
	expect(merged).toHaveLength(26);
});
