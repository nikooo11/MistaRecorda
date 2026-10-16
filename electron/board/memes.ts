import { z } from "zod";
import type { BoardMode, BoardState } from "../../src/types/board";
import { bundledMemeFromURL } from "../../src/lib/bundledMemes";
import { DEFAULT_MEME_PLAYBACK } from "../../src/types/memes";
import { objectContainsPoint } from "../../src/components/board/objectPlacement";

const transition = z.enum(["none", "fade", "spin", "fall"]);
export const memeShakeSchema = z.object({
	target: z.enum(["meme", "screen"]),
	strength: z.number().min(1).max(24),
	durationMs: z.number().int().min(100).max(2000),
});
const point = z.number().finite().min(-1e7).max(1e7);
const angle = z.number().finite().min(-Math.PI).max(Math.PI);
export const memeSchema = z.object({
	edited: z.boolean().optional(),
	shake: memeShakeSchema.optional(),
	tags: z
		.array(z.string().trim().min(1).max(40))
		.max(30)
		.transform((tags) => [...new Set(tags.map((tag) => tag.toLowerCase()))])
		.optional(),
	description: z.string().trim().max(300).optional(),
	loved: z.boolean().optional(),
	shadow: z.boolean().optional(),
	id: z.string().uuid(),
	name: z.string().trim().min(1).max(80),
	dataURL: z
		.string()
		.max(16 * 1024 * 1024)
		.refine(
			(value) =>
				/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value) ||
				!!bundledMemeFromURL(value),
			"Choose an uploaded image or a bundled meme.",
		),
	width: z.number().positive().max(20000),
	height: z.number().positive().max(20000),
	enter: transition.default(DEFAULT_MEME_PLAYBACK.enter),
	exit: transition.default(DEFAULT_MEME_PLAYBACK.exit),
	stayUntilClicked: z.boolean().default(DEFAULT_MEME_PLAYBACK.stayUntilClicked),
	durationSeconds: z.number().min(1).max(120).default(DEFAULT_MEME_PLAYBACK.durationSeconds),
	soundId: z.union([z.literal(""), z.string().uuid()]).default(""),
});
export const placedMemeSchema = z.object({
	angle: angle.optional(),
	shake: memeShakeSchema.optional(),
	shakeAt: z.number().nonnegative().optional(),
	shadow: z.boolean().optional(),
	id: z.string().uuid(),
	assetId: z.string().uuid(),
	x: point,
	y: point,
	width: z.number().positive().max(20000),
	height: z.number().positive().max(20000),
	placedAt: z.number().nonnegative(),
	removedAt: z.number().nonnegative().optional(),
	enter: transition,
	exit: transition,
	stayUntilClicked: z.boolean(),
	durationSeconds: z.number().min(1).max(120),
});
export function validateMemes(state: BoardState) {
	const memes = z
		.array(memeSchema)
		.max(60)
		.parse(state.memes ?? []);
	if (JSON.stringify(memes).length > 48 * 1024 * 1024)
		throw Error("Meme library exceeds 36 MB. Remove an unused meme first.");
	return {
		memes,
		favoriteMemeIds: [
			...new Set(
				z
					.array(z.string().uuid())
					.max(60)
					.parse(state.favoriteMemeIds ?? []),
			),
		].filter((id) => memes.some((m) => m.id === id)),
		placedMemes: {
			screen: z
				.array(placedMemeSchema)
				.max(200)
				.parse(state.placedMemes?.screen ?? []),
			board: z
				.array(placedMemeSchema)
				.max(200)
				.parse(state.placedMemes?.board ?? []),
		},
	};
}
export function placeMeme(state: BoardState, input: unknown) {
	const data = z
		.object({
			assetId: z.string().uuid(),
			mode: z.enum(["screen", "board"]),
			x: point,
			y: point,
			width: z.number().positive().max(4000),
			angle: angle.optional(),
			shadow: z.boolean().optional(),
		})
		.parse(input);
	const asset = state.memes?.find((m) => m.id === data.assetId);
	if (!asset) throw Error("Meme is no longer in your library.");
	state.placedMemes ??= { screen: [], board: [] };
	state.placedMemes[data.mode] = state.placedMemes[data.mode].filter(
		(m) =>
			!m.removedAt &&
			(m.shadow ||
				m.stayUntilClicked ||
				m.placedAt + m.durationSeconds * 1000 + 450 > Date.now()),
	);
	if (state.placedMemes[data.mode].length >= 200)
		throw Error("Clear some memes before placing more.");
	state.placedMemes[data.mode].push({
		shake: asset.shake,
		shakeAt: (data.shadow ?? asset.shadow) ? undefined : Date.now(),
		shadow: data.shadow ?? asset.shadow ?? false,
		id: crypto.randomUUID(),
		assetId: asset.id,
		x: data.x,
		y: data.y,
		width: data.width,
		angle: data.angle,
		height: Math.min(20000, (data.width * asset.height) / asset.width),
		placedAt: Date.now(),
		enter: asset.enter,
		exit: asset.exit,
		stayUntilClicked: asset.stayUntilClicked,
		durationSeconds: asset.durationSeconds,
	});
	return (data.shadow ?? asset.shadow) ? "" : asset.soundId;
}
export function clearMemes(state: BoardState, mode: BoardMode) {
	state.placedMemes ??= { screen: [], board: [] };
	state.placedMemes[mode] = [];
}

/** Only a visible meme may intercept input on the otherwise click-through surface. */
export function memeAtPoint(state: BoardState, x: number, y: number, now = Date.now()) {
	if (!state.enabled || state.output === "screen") return undefined;
	const mode = state.output === "board" ? "board" : state.mode;
	const scene = state.scenes[mode];
	const sceneX = x / scene.zoom - scene.scrollX;
	const sceneY = y / scene.zoom - scene.scrollY;
	const items = state.placedMemes?.[mode] ?? [];
	for (let i = items.length - 1; i >= 0; i--) {
		const m = items[i];
		if (
			!m.shadow &&
			m.removedAt === undefined &&
			(m.stayUntilClicked || now < m.placedAt + m.durationSeconds * 1000) &&
			state.memes?.some((a) => a.id === m.assetId) &&
			objectContainsPoint(m, sceneX, sceneY)
		)
			return m;
	}
	return undefined;
}

export function dismissMeme(state: BoardState, id: string, now = Date.now()) {
	// Resolve the actual placement, including a whiteboard viewed privately on the
	// iPad. The active Mac scene may have changed since the pointer went down.
	const lists = [
		state.placedMemes?.screen ?? [],
		state.placedMemes?.board ?? [],
		...(state.whiteboards ?? []).map((p) => p.memes),
	];
	let changed = false;
	for (const list of lists) {
		const item = list.find((m) => m.id === id);
		if (item && item.removedAt === undefined) {
			item.removedAt = now;
			changed = true;
		}
	}
	return changed;
}

export function placedMeme(state: BoardState, id: string) {
	return [
		...(state.placedMemes?.screen ?? []),
		...(state.placedMemes?.board ?? []),
		...(state.whiteboards ?? []).flatMap((p) => p.memes),
	].find((m) => m.id === id);
}
export function updatePlacedMeme(state: BoardState, input: unknown) {
	const patch = z
		.object({
			id: z.string().uuid(),
			x: point.optional(),
			y: point.optional(),
			width: z.number().min(16).max(4000).optional(),
			angle: angle.optional(),
			keep: z.boolean().optional(),
		})
		.parse(input);
	const item = placedMeme(state, patch.id);
	if (!item || item.removedAt !== undefined) throw Error("This meme has left the screen.");
	const rect = {
		x: patch.x ?? item.x,
		y: patch.y ?? item.y,
		width: patch.width ?? item.width,
		angle: patch.angle ?? item.angle,
		height: patch.width ? (patch.width * item.height) / item.width : item.height,
	};
	for (const list of [
		state.placedMemes?.screen ?? [],
		state.placedMemes?.board ?? [],
		...(state.whiteboards ?? []).map((p) => p.memes),
	]) {
		const m = list.find((m) => m.id === patch.id);
		if (m)
			Object.assign(
				m,
				rect,
				patch.keep === undefined ? {} : { stayUntilClicked: patch.keep },
			);
	}
	return item;
}
