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
export function recordingVoiceKey(
	recording: VoiceRecording | null,
	settings: VoiceSettings,
): string {
	return recording?.voiceCues?.some((c) => c.settings)
		? JSON.stringify(
				recording.voiceCues.map((c) => [
					c.startMs,
					c.settings ? voiceProcessingKey(c.settings) : null,
				]),
			)
		: voiceProcessingKey(settings);
}
export function isVoiceExportReady(
	recording: VoiceRecording | null,
	settings: VoiceSettings | null,
): boolean {
	if (!voiceChangeEnabled(recording)) return true;
	return Boolean(
		(settings?.voiceId || recording?.voiceCues?.some((c) => c.settings)) &&
			settings &&
			recording?.changedMicPath &&
			recording.micSelection === "changed" &&
			recording.changedSettingsKey === recordingVoiceKey(recording, settings),
	);
}
