import { z } from "zod";
import type { BoardMode, BoardState } from "../../src/types/board";

const transition = z.enum(["none", "fade", "spin", "fall"]);
const point = z.number().finite().min(-1e7).max(1e7);
export const memeSchema = z.object({
	id: z.string().uuid(),
	name: z.string().trim().min(1).max(80),
	dataURL: z
		.string()
		.max(16 * 1024 * 1024)
		.regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/),
	width: z.number().positive().max(20000),
	height: z.number().positive().max(20000),
	enter: transition.default("none"),
	exit: transition.default("none"),
	stayUntilClicked: z.boolean().default(true),
	durationSeconds: z.number().min(1).max(120).default(5),
	soundId: z.union([z.literal(""), z.string().uuid()]).default(""),
});
export const placedMemeSchema = z.object({
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
		})
		.parse(input);
	const asset = state.memes?.find((m) => m.id === data.assetId);
	if (!asset) throw Error("Meme is no longer in your library.");
	state.placedMemes ??= { screen: [], board: [] };
	state.placedMemes[data.mode] = state.placedMemes[data.mode].filter(
		(m) =>
			!m.removedAt &&
			(m.stayUntilClicked || m.placedAt + m.durationSeconds * 1000 + 450 > Date.now()),
	);
	if (state.placedMemes[data.mode].length >= 200)
		throw Error("Clear some memes before placing more.");
	state.placedMemes[data.mode].push({
		id: crypto.randomUUID(),
		assetId: asset.id,
		x: data.x,
		y: data.y,
		width: data.width,
		height: Math.min(20000, (data.width * asset.height) / asset.width),
		placedAt: Date.now(),
		enter: asset.enter,
		exit: asset.exit,
		stayUntilClicked: asset.stayUntilClicked,
		durationSeconds: asset.durationSeconds,
	});
	return asset.soundId;
}
export function clearMemes(state: BoardState, mode: BoardMode) {
	state.placedMemes ??= { screen: [], board: [] };
	state.placedMemes[mode] = [];
}
