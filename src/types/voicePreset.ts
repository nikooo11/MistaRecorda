import { z } from "zod";
const unit = z.number().finite().min(0).max(1);
export const voicePresetSchema = z
	.object({
		schema: z.literal("mistarecorda.voice-preset"),
		version: z.literal(1),
		id: z.string().uuid(),
		name: z.string().trim().min(1).max(160),
		createdBy: z.string().trim().max(320),
		createdAt: z.string().datetime(),
		updatedAt: z.string().datetime(),
		voice: z
			.object({
				voiceId: z.string().min(1).max(256),
				source: z.enum(["library", "owned", "workspace-shared"]),
				publicOwnerId: z.string().max(256).nullable(),
				originalName: z.string().max(160),
				category: z.string().max(80),
			})
			.strict(),
		settings: z
			.object({
				modelId: z.string().regex(/^eleven_[a-z0-9_]{1,80}$/),
				stability: unit,
				similarityBoost: unit,
				style: unit,
				useSpeakerBoost: z.boolean(),
				removeBackgroundNoise: z.boolean(),
				postFx: z
					.object({
						loudnessLufs: z.number().finite().min(-30).max(-10),
						eqPreset: z.enum(["none", "warm", "bright"]),
						pitchSemitones: z.number().finite().min(-12).max(12),
					})
					.strict(),
			})
			.strict(),
		preview: z
			.object({
				format: z.enum(["mp3", "wav"]),
				base64: z
					.string()
					.max(8 * 1024 * 1024)
					.regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
				text: z.string().max(2000),
			})
			.strict(),
		tags: z.array(z.string().max(80)).max(40),
		isFavorite: z.boolean(),
	})
	.strict();
export type VoicePreset = z.infer<typeof voicePresetSchema>;
export type PresetEntry = { preset: VoicePreset; location: "mine" | "team" };
export function migratePreset(value: unknown): VoicePreset {
	if (!value || typeof value !== "object") throw new Error("invalidPreset");
	const version = (value as { version?: unknown }).version;
	if (typeof version === "number" && version > 1) throw new Error("futurePresetVersion");
	// Version-indexed parser keeps future migrations explicit; no guessed legacy values.
	const migrations: Record<number, (v: unknown) => VoicePreset> = {
		1: (v) => {
			const r = voicePresetSchema.safeParse(v);
			if (!r.success) throw new Error("invalidPreset");
			return r.data;
		},
	};
	if (typeof version !== "number" || !migrations[version]) throw new Error("invalidPreset");
	return migrations[version](value);
}
