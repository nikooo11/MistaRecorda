import type { AutoCaptionSettings } from "./types";

export const CAPTION_PRESETS = [
	{
		id: "highlight",
		name: "Current word",
		description: "Up to 3 words · spoken word highlighted",
		example: "Make your point",
		rank: 1,
	},
	{
		id: "short",
		name: "Short phrases",
		description: "1–3 words · balanced reading pace",
		example: "Make your point",
		rank: 2,
	},
	{
		id: "single",
		name: "Single word",
		description: "One word · quick, emphatic delivery",
		example: "Point.",
		rank: 3,
	},
	{
		id: "classic",
		name: "Classic subtitles",
		description: "Fuller phrases · tutorials and longer videos",
		example: "Make your point clearly.",
		rank: 4,
	},
] as const;
export type CaptionPreset = (typeof CAPTION_PRESETS)[number]["id"];
export function captionPresetSettings(preset: CaptionPreset): Partial<AutoCaptionSettings> {
	return {
		preset,
		wordsPerPage: preset === "single" ? 1 : 3,
		maxRows: preset === "classic" ? 2 : 1,
		animationStyle: "none",
		fontSize: preset === "classic" ? 30 : 44,
		textColor: preset === "highlight" ? "#111111" : "#FFFFFF",
		backgroundColor: preset === "highlight" ? "#FFFFFF" : "#000000",
		highlightColor: "#68E0CF",
		backgroundOpacity: preset === "highlight" ? 0.96 : 0.85,
		boxRadius: preset === "highlight" ? 2 : 6,
	};
}
export function captionWordLimit(settings: AutoCaptionSettings): number | undefined {
	if (!settings.preset || settings.preset === "classic") return undefined;
	return settings.preset === "single"
		? 1
		: Math.max(1, Math.min(3, Math.round(settings.wordsPerPage || 3)));
}
