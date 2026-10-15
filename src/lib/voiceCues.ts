import type { VoiceSettings } from "../types/voice";
export interface VoiceCue {
	id: string;
	startMs: number;
	settings: VoiceSettings | null;
	color: string;
}
const colors = ["#bb79dc", "#49a6b5", "#d99a4b", "#7ca65f", "#d87886", "#6d91da"];
export function voiceColor(id: string) {
	let hash = 0;
	for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
	return colors[hash % colors.length];
}
export function cueSpans(cues: VoiceCue[], durationMs: number) {
	return [...cues]
		.sort((a, b) => a.startMs - b.startMs)
		.map((cue, i, all) => ({
			...cue,
			endMs: Math.min(durationMs, all[i + 1]?.startMs ?? durationMs),
		}))
		.filter((cue) => cue.startMs < cue.endMs);
}
