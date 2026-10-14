import { z } from "zod";
import type { AudioRegion } from "../../src/components/video-editor/types";
export const shortcutSchema = z
	.string()
	.max(90)
	.refine(
		(s) =>
			s === "" ||
			/^(?:(?:CommandOrControl|Command|Control|Alt|Shift|Super)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Space|Tab|Escape|Enter|(?:Arrow)?(?:Up|Down|Left|Right)|Delete|Backspace)$/.test(
				s,
			),
		"Use Command, Control, Alt, or Windows with a letter, number, function key, or navigation key.",
	);
export const sourceSchema = z.object({
	id: z.string().regex(/^(window|screen):\d+(?::\d+)?$/),
	name: z.string().min(1).max(500),
	appName: z.string().max(200).optional(),
	windowTitle: z.string().max(500).optional(),
	display_id: z.string().max(30).optional(),
	sourceType: z.enum(["window", "screen"]),
});
export const soundSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(100),
	file: z.string().regex(/^[a-f0-9-]+\.wav$/),
	durationMs: z.number().positive().max(120000),
	shortcut: shortcutSchema,
	volume: z.number().min(0).max(2),
});
export const studioSettingsSchema = z.object({
	glow: z.boolean(),
	cameraShortcut: shortcutSchema.default("CommandOrControl+Shift+W"),
	scenes: z
		.array(
			z.object({
				id: z.string().uuid(),
				name: z.string().trim().min(1).max(60),
				source: sourceSchema,
				camera: z.boolean(),
				shortcut: shortcutSchema,
			}),
		)
		.max(6)
		.default([]),
	windows: z
		.array(
			z.object({
				slot: z.number().int().min(1).max(6),
				shortcut: shortcutSchema,
				source: sourceSchema,
			}),
		)
		.max(6),
	sounds: z.array(soundSchema).max(24),
});
export class SoundTake {
	regions: AudioRegion[] = [];
	private last = new Map<string, number>();
	trigger(
		id: string,
		path: string,
		durationMs: number,
		volume: number,
		timeMs: number,
		paused: boolean,
	) {
		if (
			paused ||
			this.regions.length >= 4096 ||
			timeMs - (this.last.get(id) ?? -Infinity) < 150
		)
			return false;
		this.last.set(id, timeMs);
		this.regions.push({
			id: `sound-${crypto.randomUUID()}`,
			startMs: Math.round(timeMs),
			endMs: Math.round(timeMs + durationMs),
			audioPath: path,
			volume,
			normalize: false,
			trackIndex: 0,
		});
		return true;
	}
}
