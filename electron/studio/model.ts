import { z } from "zod";
import type { AudioRegion } from "../../src/components/video-editor/types";
export const shortcutSchema = z
	.string()
	.max(90)
	.refine(
		(s) =>
			s === "" ||
			/^(?:(?:CommandOrControl|Command|Control|Alt|Shift|Super)\+)*(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Space|Tab|Escape|Enter|(?:Arrow)?(?:Up|Down|Left|Right)|Delete|Backspace)$/.test(
				s,
			),
		"Use a letter, number, function key or navigation key, optionally with modifiers.",
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
	favorite: z.boolean().default(false),
	loved: z.boolean().default(false),
	color: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.default("#466784"),
});
export const cameraLayoutSchema = z.object({
	borderWidth: z.number().min(0).max(4).optional(),
	borderColor: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.optional(),
	shadow: z.number().min(0).max(1).optional(),
	x: z.number().min(0).max(1),
	y: z.number().min(0).max(1),
	size: z.number().min(10).max(60),
	roundness: z.number().min(0).max(100),
	mirror: z.boolean(),
	locked: z.boolean(),
});
export const sceneMediaSchema = z.object({
	id: z.string().uuid(),
	name: z.string().trim().min(1).max(100),
	kind: z.enum(["image", "video", "audio"]),
	file: z.string().regex(/^[a-f0-9-]{36}\.(png|jpg|jpeg|gif|webp|mp4|m4a)$/),
	enabled: z.boolean(),
	x: z.number().min(0).max(1),
	y: z.number().min(0).max(1),
	width: z.number().min(0.05).max(1),
	height: z.number().min(0.05).max(1),
	opacity: z.number().min(0).max(1),
	volume: z.number().min(0).max(1),
	loop: z.boolean(),
	durationMs: z.number().positive().max(3600000).optional(),
	hasAudio: z.boolean(),
});
export const studioSettingsSchema = z.object({
	sourceAliases: z
		.array(z.object({ source: sourceSchema, name: z.string().trim().min(1).max(80) }))
		.max(100)
		.default([]),
	glow: z.boolean(),
	includeSoundboardInRecording: z.boolean().default(true),
	cameraLayout: cameraLayoutSchema.default({
		x: 0.97,
		y: 0.97,
		size: 26,
		roundness: 90,
		mirror: true,
		locked: false,
	}),
	cameraShortcut: shortcutSchema.default("CommandOrControl+Shift+W"),
	scenes: z
		.array(
			z.object({
				id: z.string().uuid(),
				name: z.string().trim().min(1).max(60),
				source: sourceSchema,
				camera: z.boolean(),
				audio: z.object({ microphone: z.boolean(), system: z.boolean() }).optional(),
				cameraLayout: cameraLayoutSchema.optional(),
				shortcut: shortcutSchema,
				media: z.array(sceneMediaSchema).max(24).default([]),
			}),
		)
		.max(6)
		.default([]),
	windows: z
		.array(
			z.object({
				slot: z.number().int().min(1).max(64),
				shortcut: shortcutSchema,
				source: sourceSchema,
			}),
		)
		.max(64),
	sounds: z.array(soundSchema).max(200),
	installedDefaultSoundIds: z.array(z.string().uuid()).max(2000).default([]),
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
