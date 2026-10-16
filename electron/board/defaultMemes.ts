import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { bundledMemes, bundledMemeURL } from "../../src/lib/bundledMemes";
import type { BoardState } from "../../src/types/board";
import { DEFAULT_MEME_PLAYBACK } from "../../src/types/memes";
import { gifSize } from "./gifSize";
import { memeSchema, validateMemes } from "./memes";

export async function seedDefaultMemes(state: BoardState, assets: string, restore = false) {
	const installed = new Set(state.installedDefaultMemeIds ?? []);
	const existing = new Set(state.memes?.map((m) => m.id));
	const missing = bundledMemes.filter(
		(m) => !existing.has(m.id) && (restore || !installed.has(m.id)),
	);
	const capacity = Math.max(0, 60 - (state.memes?.length ?? 0));
	if (restore && missing.length > capacity)
		throw Error("Make room before restoring memes (60 maximum).");
	const additions = await Promise.all(
		missing.slice(0, capacity).map(async (m) => {
			const data = await fs.readFile(path.join(assets, m.asset));
			if (createHash("sha256").update(data).digest("hex") !== m.sha256)
				throw Error(`Default meme is damaged: ${m.name}`);
			const size = gifSize(data);
			return memeSchema.parse({ ...m, ...size, dataURL: bundledMemeURL(m.asset) });
		}),
	);
	for (const meme of additions) installed.add(meme.id);
	for (const meme of bundledMemes) if (existing.has(meme.id)) installed.add(meme.id);
	if (
		state.memeDefaultsVersion === 1 &&
		!additions.length &&
		installed.size === (state.installedDefaultMemeIds ?? []).length
	)
		return state;
	// Upgrade untouched library defaults once. Keep customized playback and existing
	// placements intact, and allow users to choose the old behavior again afterwards.
	const memes = (state.memes ?? []).map((m) =>
		state.memeDefaultsVersion !== 1 &&
		m.enter === "none" &&
		m.exit === "none" &&
		m.stayUntilClicked &&
		m.durationSeconds === 5
			? { ...m, ...DEFAULT_MEME_PLAYBACK }
			: m,
	);
	const next = {
		...state,
		memeDefaultsVersion: 1 as const,
		memes: [...memes, ...additions],
		installedDefaultMemeIds: [...installed],
	};
	return { ...next, ...validateMemes(next) };
}
