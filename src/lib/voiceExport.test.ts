import { describe, expect, it } from "vitest";
import { defaultVoiceSettings, type VoiceRecording } from "../types/voice";
import { isVoiceExportReady, voiceChangeEnabled, voiceProcessingKey } from "./voiceExport";

const settings = { ...defaultVoiceSettings, voiceId: "team-voice", voiceName: "Team" };
const original: VoiceRecording = {
	videoPath: "/take.mp4",
	micPath: "/take.mic.wav",
	systemAudioPath: null,
	micOffsetMs: 0,
};
const processed = {
	...original,
	voiceChangeEnabled: true,
	micSelection: "changed" as const,
	changedMicPath: "/take.voice-mic.wav",
	changedSettingsKey: voiceProcessingKey(settings),
};
describe("explicit voice processing before export", () => {
	it("records and exports original audio by default even with a selected voice", () => {
		expect(voiceChangeEnabled(original)).toBe(false);
		expect(isVoiceExportReady(original, settings)).toBe(true);
		expect(isVoiceExportReady(null, settings)).toBe(true);
	});
	it("requires a processed track matching the choice when voice change is enabled", () => {
		expect(isVoiceExportReady({ ...original, voiceChangeEnabled: true }, settings)).toBe(false);
		expect(isVoiceExportReady(processed, settings)).toBe(true);
		expect(isVoiceExportReady({ ...processed, micSelection: "original" }, settings)).toBe(
			false,
		);
		expect(isVoiceExportReady({ ...processed, changedMicPath: undefined }, settings)).toBe(
			false,
		);
		expect(isVoiceExportReady(processed, { ...settings, voiceId: "another" })).toBe(false);
		expect(isVoiceExportReady(processed, { ...settings, stability: 0.1 })).toBe(false);
		expect(
			isVoiceExportReady(processed, {
				...settings,
				postFx: { ...settings.postFx, pitchSemitones: 2 },
			}),
		).toBe(false);
		expect(
			isVoiceExportReady(
				{ ...processed, voiceChangeEnabled: false, micSelection: "original" },
				{ ...settings, voiceId: "another" },
			),
		).toBe(true);
	});
	it("does not invalidate converted audio for a display name, consent or team-folder change", () => {
		expect(
			isVoiceExportReady(processed, {
				...settings,
				voiceName: "Renamed",
				noticeAccepted: true,
				teamFolder: "/team",
			}),
		).toBe(true);
		expect(isVoiceExportReady({ ...processed, changedSettingsKey: undefined }, settings)).toBe(
			false,
		);
	});
});
