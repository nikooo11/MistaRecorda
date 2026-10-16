import type { BoardState } from "../../types/board";
import { DEFAULT_MEME_PLAYBACK, type MemeAsset } from "../../types/memes";
import { bundledMemes } from "../../lib/bundledMemes";

export function sortedMemes(state: BoardState): MemeAsset[] {
	const favorites = new Set(state.favoriteMemeIds ?? []);
	return [...(state.memes ?? [])].sort(
		(a, b) =>
			Number(!!b.loved) - Number(!!a.loved) ||
			Number(favorites.has(b.id)) - Number(favorites.has(a.id)),
	);
}

// Recognize older customized playback too, before the explicit edited flag existed.
export function isEditedMeme(meme: MemeAsset): boolean {
	const original = bundledMemes.find((m) => m.id === meme.id);
	return (
		!!meme.edited ||
		!!meme.shake ||
		!!meme.shadow ||
		meme.enter !== DEFAULT_MEME_PLAYBACK.enter ||
		meme.exit !== DEFAULT_MEME_PLAYBACK.exit ||
		meme.stayUntilClicked !== DEFAULT_MEME_PLAYBACK.stayUntilClicked ||
		meme.durationSeconds !== DEFAULT_MEME_PLAYBACK.durationSeconds ||
		meme.soundId !== (original?.soundId ?? "")
	);
}

export function matchingMemes(
	state: BoardState,
	query: string,
	category: "all" | "edited" = "all",
): MemeAsset[] {
	const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
	return sortedMemes(state).filter((meme) => {
		if (category === "edited" && !isEditedMeme(meme)) return false;
		const text = [meme.name, meme.description, ...(meme.tags ?? [])].join(" ").toLowerCase();
		return terms.every((term) => text.includes(term));
	});
}

/** Preparation favorites carry into the take. Stopping prepares a fresh list for the next take. */
export function finishMemeTake(state: BoardState, wasRecording: boolean, recording: boolean) {
	if (!wasRecording || recording || !state.favoriteMemeIds?.length) return false;
	state.favoriteMemeIds = [];
	return true;
}

/** Loading an environment replaces project choices, but never personal loves or the shared library. */
export function mergeMemeLibraries(current: MemeAsset[], imported: MemeAsset[]) {
	const previous = new Map(current.map((meme) => [meme.id, meme]));
	const merged = new Map(previous);
	for (const meme of imported)
		merged.set(meme.id, previous.get(meme.id) ?? { ...meme, loved: false });
	return [...merged.values()];
}
