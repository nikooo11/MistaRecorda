import { pdfBundleSchema, validatePDF } from "./presentationPDF";
import { createHash } from "node:crypto";
import { z } from "zod";
import { emptyBoardScene, type BoardState } from "../../src/types/board";
import type { PresenterDocument } from "../../src/types/presenter";
import { validateScene, validateWhiteboards } from "./store";
import { validateMemes } from "./memes";
import { documentSchema } from "./presenter";
import { chartBundleSchema, type ChartBundle } from "../charts/store";
import { chartMeta } from "../../src/components/board/charts/chartModel";

export const soundBundleSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(100),
	volume: z.number().min(0).max(2),
	durationMs: z.number().positive().max(120000),
	favorite: z.boolean().optional(),
	color: z
		.string()
		.regex(/^#[0-9a-f]{6}$/i)
		.optional(),
	data: z
		.string()
		.max(34 * 1024 * 1024)
		.regex(/^[A-Za-z0-9+/=]+$/),
});
export type BundledSound = z.infer<typeof soundBundleSchema>;
export interface PresentationBundle {
	format: "mistarecorda-presentation";
	version: 1;
	name: string;
	board: Pick<
		BoardState,
		| "whiteboards"
		| "activeWhiteboardId"
		| "width"
		| "height"
		| "scenes"
		| "assets"
		| "memes"
		| "placedMemes"
		| "library"
		| "favoriteMemeIds"
	>;
	presenter: PresenterDocument;
	sounds: BundledSound[];
	/** Optional so environments saved before AI charts still load. */
	charts?: ChartBundle;
	privatePDFs?: Record<string, string>;
}
export function validatePresentationBundle(input: unknown): PresentationBundle {
	if (!input || JSON.stringify(input).length > 44 * 1024 * 1024)
		throw Error("Presentation exceeds 44 MB. Use smaller media files.");
	const value = z
		.object({
			format: z.literal("mistarecorda-presentation"),
			version: z.literal(1),
			name: z.string().trim().min(1).max(80),
			board: z.object({
				whiteboards: z.unknown().optional(),
				activeWhiteboardId: z.string().optional(),
				width: z.number().min(100).max(20000),
				height: z.number().min(100).max(20000),
				scenes: z.object({ screen: z.unknown(), board: z.unknown() }),
				assets: z.unknown(),
				memes: z.unknown(),
				favoriteMemeIds: z.array(z.string().uuid()).max(60).optional(),
				placedMemes: z.unknown(),
				library: z.array(z.unknown()).max(1000),
			}),
			presenter: documentSchema,
			sounds: z.array(soundBundleSchema).max(200),
			charts: chartBundleSchema.optional(),
			privatePDFs: pdfBundleSchema.optional(),
		})
		.parse(input);
	for (const pdf of value.presenter.pdfs ?? []) {
		const bytes = validatePDF(value.privatePDFs?.[pdf.id] ?? "");
		if (createHash("sha256").update(bytes).digest("hex") !== pdf.hash)
			throw Error("Presentation has a missing or damaged private PDF.");
	}
	const board = value.board as PresentationBundle["board"];
	const screen = validateScene(board.scenes.screen),
		whiteboard = validateScene(board.scenes.board);
	const tabs = validateWhiteboards(board as BoardState);
	const assets = validateScene({
		...emptyBoardScene(),
		files: {
			...board.assets,
			...screen.files,
			...whiteboard.files,
			...Object.assign({}, ...tabs.whiteboards.map((p) => p.scene.files)),
		},
	}).files;
	for (const scene of [screen, whiteboard, ...tabs.whiteboards.map((p) => p.scene)]) {
		for (const element of scene.elements)
			if (element.type === "image" && !element.isDeleted) {
				const id = String(element.fileId);
				if (!assets[id]) throw Error("Presentation has a missing image.");
				scene.files[id] = assets[id];
			}
	}
	const chartIds = new Set(value.charts?.charts.map((c) => c.id) ?? []);
	// Every saved whiteboard tab is checked, not only the active one.
	for (const scene of [screen, whiteboard, ...tabs.whiteboards.map((p) => p.scene)])
		for (const element of scene.elements) {
			const meta = chartMeta(element);
			if (meta && !element.isDeleted && !chartIds.has(meta.chartId))
				throw Error("Presentation has a missing chart.");
		}
	const memes = validateMemes(board as BoardState);
	for (const mode of ["screen", "board"] as const) {
		memes.placedMemes[mode] = memes.placedMemes[mode]
			.filter((m) => !m.removedAt)
			.map((m) => ({ ...m, placedAt: Date.now() }));
		for (const m of memes.placedMemes[mode])
			if (!memes.memes.some((a) => a.id === m.assetId))
				throw Error("Presentation has a missing meme.");
	}
	for (const page of tabs.whiteboards) {
		page.memes = page.memes
			.filter((m) => !m.removedAt)
			.map((m) => ({ ...m, placedAt: Date.now() }));
		for (const item of page.memes)
			if (!memes.memes.some((asset) => asset.id === item.assetId))
				throw Error("Presentation has a missing meme.");
	}
	// Validate reusable library geometry as strictly as the active canvases.
	for (const item of board.library) {
		const entry = z
			.object({ elements: z.array(z.unknown()) })
			.passthrough()
			.parse(item);
		validateScene({ ...emptyBoardScene(), elements: entry.elements, files: assets });
	}
	const soundIds = new Set(value.sounds.map((s) => s.id));
	for (const meme of memes.memes)
		if (meme.soundId && !soundIds.has(meme.soundId))
			throw Error("Presentation has a missing meme sound.");
	if (soundIds.size !== value.sounds.length) throw Error("Duplicate sound IDs.");
	for (const s of value.sounds) {
		const data = Buffer.from(s.data, "base64");
		if (
			data.length > 25 * 1024 * 1024 ||
			data.toString("ascii", 0, 4) !== "RIFF" ||
			data.toString("ascii", 8, 12) !== "WAVE"
		)
			throw Error("Presentation sound must be a WAV file under 25 MB.");
	}
	return {
		...value,
		board: { ...board, ...tabs, scenes: { screen, board: whiteboard }, assets, ...memes },
	};
}
export function presentationName(value: unknown) {
	return z
		.string()
		.regex(
			/^[\p{L}\p{N} _-]{1,80}$/u,
			"Use letters, numbers, spaces or dashes for the environment name.",
		)
		.parse(value);
}

/** Keep geometry editable and fit the saved coordinate space uniformly on a different display. */
export function fitPresentation(board: PresentationBundle["board"], width: number, height: number) {
	const scale = Math.min(width / board.width, height / board.height);
	const x = (width - board.width * scale) / 2,
		y = (height - board.height * scale) / 2;
	for (const scene of [
		...Object.values(board.scenes),
		...(board.whiteboards ?? [])
			.filter((p) => p.id !== board.activeWhiteboardId)
			.map((p) => p.scene),
	]) {
		const zoom = scene.zoom * scale;
		if (zoom < 0.1 || zoom > 10)
			throw Error(
				"The saved zoom does not fit this display. Fit both canvases before exporting.",
			);
		scene.zoom = zoom;
		scene.scrollX += x / zoom;
		scene.scrollY += y / zoom;
	}
	board.width = width;
	board.height = height;
	return board;
}
