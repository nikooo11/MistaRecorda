import type { VoiceRecording, VoiceSettings } from "../types/voice";

/** Only settings that change the produced audio participate; names and secrets do not. */
export function voiceProcessingKey(s: VoiceSettings): string {
	return JSON.stringify([
		s.voiceId,
		s.modelId,
		s.stability,
		s.similarityBoost,
		s.style,
		s.useSpeakerBoost,
		s.removeBackgroundNoise,
		s.outputFormat,
		s.postFx.loudnessLufs,
		s.postFx.eqPreset,
		s.postFx.pitchSemitones,
	]);
}
export function voiceChangeEnabled(recording: VoiceRecording | null): boolean {
	return recording?.voiceChangeEnabled ?? recording?.micSelection === "changed";
}
export function isVoiceExportReady(
	recording: VoiceRecording | null,
	settings: VoiceSettings | null,
): boolean {
	if (!voiceChangeEnabled(recording)) return true;
	return Boolean(
		settings?.voiceId &&
			recording?.changedMicPath &&
			recording.micSelection === "changed" &&
			recording.changedSettingsKey === voiceProcessingKey(settings),
	);
}
