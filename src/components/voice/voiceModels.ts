import type { VoiceModel } from "@/types/voice";
export const fallbackVoiceModels: VoiceModel[] = [
	{
		modelId: "eleven_multilingual_sts_v2",
		name: "Multilingual v2",
		canConvert: true,
		canSpeak: false,
	},
	{ modelId: "eleven_english_sts_v2", name: "English v2", canConvert: true, canSpeak: false },
];
export function modelLabel(id: string) {
	return (
		fallbackVoiceModels.find((m) => m.modelId === id)?.name ??
		id.replace(/^eleven_/, "").replace(/_/g, " ")
	);
}
export function qualityLabel(ids?: string[]) {
	if (!ids?.length) return "Model details not supplied";
	return `Quality: ${ids.map(modelLabel).join(", ")}`;
}
