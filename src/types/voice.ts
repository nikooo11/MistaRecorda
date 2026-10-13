export interface VoiceSettings {
	enabled: boolean;
	noticeAccepted: boolean;
	voiceId: string;
	voiceName: string;
	modelId: "eleven_multilingual_sts_v2" | "eleven_english_sts_v2";
	stability: number;
	similarityBoost: number;
	style: number;
	useSpeakerBoost: boolean;
	removeBackgroundNoise: boolean;
	outputFormat: "pcm_44100" | "mp3_44100_192";
	postFx: { loudnessLufs: number; eqPreset: "none" | "warm" | "bright"; pitchSemitones: number };
	teamFolder: string;
}
export const defaultVoiceSettings: VoiceSettings = {
	enabled: false,
	noticeAccepted: false,
	voiceId: "",
	voiceName: "",
	modelId: "eleven_multilingual_sts_v2",
	stability: 0.5,
	similarityBoost: 0.75,
	style: 0,
	useSpeakerBoost: true,
	removeBackgroundNoise: true,
	outputFormat: "pcm_44100",
	postFx: { loudnessLufs: -16, eqPreset: "none", pitchSemitones: 0 },
	teamFolder: "",
};
export interface VoiceInfo {
	voiceId: string;
	name: string;
	category: string;
	previewUrl: string | null;
	source: "owned" | "library" | "workspace-shared";
	publicOwnerId: string | null;
	canEdit: boolean;
	description?: string;
	labels?: Record<string, string>;
}
export type VoiceResult<T> = { ok: true; data: T } | { ok: false; error: string };
export interface VoiceProgress {
	jobId: string;
	videoPath: string;
	state: "running" | "done" | "error" | "cancelled";
	completed: number;
	total: number;
	error?: string;
	outputPath?: string;
}
export interface VoiceRecording {
	videoPath: string;
	micPath: string | null;
	systemAudioPath: string | null;
	micOffsetMs: number;
	changedMicPath?: string;
	voiceVideoPath?: string;
	micSelection?: "original" | "changed";
}
export interface VoiceRequests {
	start: { input: string; output: string };
	cancel: { input: string; output: boolean };
	progress: { input: undefined; output: VoiceProgress[] };
	getSettings: { input: undefined; output: VoiceSettings & { hasKey: boolean } };
	saveSettings: { input: VoiceSettings; output: VoiceSettings & { hasKey: boolean } };
	setKey: { input: string; output: { hasKey: boolean } };
	testKey: { input: undefined; output: boolean };
	listVoices: { input: undefined; output: VoiceInfo[] };
	open: { input: undefined; output: boolean };
}
export interface VoiceAPI {
	request<K extends keyof VoiceRequests>(
		method: K,
		input: VoiceRequests[K]["input"],
	): Promise<VoiceResult<VoiceRequests[K]["output"]>>;
	onProgress(callback: (progress: VoiceProgress) => void): () => void;
}
export function unwrapVoice<T>(result: VoiceResult<T>): T {
	if (!result.ok) throw new Error(result.error);
	return result.data;
}
