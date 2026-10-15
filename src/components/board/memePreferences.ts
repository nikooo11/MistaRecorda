import type { BoardState } from "../../types/board";
import type { MemeAsset } from "../../types/memes";

export function sortedMemes(state: BoardState): MemeAsset[] {
	const favorites = new Set(state.favoriteMemeIds ?? []);
	return [...(state.memes ?? [])].sort(
		(a, b) =>
			Number(!!b.loved) - Number(!!a.loved) ||
			Number(favorites.has(b.id)) - Number(favorites.has(a.id)),
	);
}

export function matchingMemes(state: BoardState, query: string): MemeAsset[] {
	const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
	return sortedMemes(state).filter((meme) => {
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
		merged.set(meme.id, { ...meme, loved: previous.get(meme.id)?.loved ?? false });
	return [...merged.values()];
}
