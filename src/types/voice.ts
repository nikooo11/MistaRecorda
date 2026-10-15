import type { VoicePreset, PresetEntry } from "./voicePreset";
export interface VoiceSettings {
	noticeAccepted: boolean;
	voiceId: string;
	voiceName: string;
	modelId: string;
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
export interface VoiceModel {
	modelId: string;
	name: string;
	canConvert: boolean;
	canSpeak: boolean;
}
export interface VoiceInfo {
	highQualityModelIds?: string[];
	voiceId: string;
	name: string;
	category: string;
	previewUrl: string | null;
	source: "owned" | "library" | "workspace-shared";
	publicOwnerId: string | null;
	canEdit: boolean;
	defaultSettings?: Pick<
		VoiceSettings,
		"stability" | "similarityBoost" | "style" | "useSpeakerBoost"
	>;
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
	systemOffsetMs?: number;
	changedMicPath?: string;
	voiceVideoPath?: string;
	micSelection?: "original" | "changed";
	changedVoiceName?: string;
	changedVoiceId?: string;
	changedModelId?: string;
	changedSettingsKey?: string;
	voiceChangeEnabled?: boolean;
}
export interface VoiceRequests {
	createVoice: {
		input: { name: string; description: string; consent: boolean };
		output: { voiceId: string; requiresVerification: boolean } | null;
	};
	storeBrowserAudio: {
		input: { videoPath: string; kind: "mic" | "system"; offsetMs: number; bytes: ArrayBuffer };
		output: boolean;
	};
	browse: {
		input: {
			tab: "mine" | "library" | "favorites";
			search?: string;
			gender?: string;
			accent?: string;
			useCase?: string;
		};
		output: VoiceInfo[];
	};
	favorites: { input: undefined; output: string[] };
	favorite: { input: { voiceId: string; enabled: boolean; name?: string }; output: string[] };
	addVoice: { input: { owner: string; voiceId: string; name: string }; output: boolean };
	presets: { input: undefined; output: PresetEntry[] };
	savePreset: { input: VoicePreset; output: VoicePreset };
	deletePreset: { input: string; output: boolean };
	usePreset: { input: VoicePreset; output: VoiceSettings & { hasKey: boolean } };
	previewPreset: { input: VoicePreset; output: VoicePreset };
	exportPreset: {
		input: { preset: VoicePreset | null; includeSamples: boolean; consent: boolean };
		output: boolean;
	};
	inspectImport: { input: { name: string; bytes: number[] } | undefined; output: VoicePreset[] };
	importPreset: {
		input: { preset: VoicePreset; rename?: string };
		output: { status: "ready" | "askShare"; preset: VoicePreset };
	};
	teamFolder: { input: undefined; output: string };
	copyToTeam: { input: VoicePreset; output: VoicePreset };
	editVoice: {
		input: {
			voiceId: string;
			name: string;
			description: string;
			labels: Record<string, string>;
			settings: VoiceSettings;
			addSamples: boolean;
			consent: boolean;
		};
		output: boolean;
	};
	shareVoice: {
		input: {
			voiceId: string;
			role: "viewer" | "editor" | "admin";
			recipient: string;
			kind: "email" | "group";
		};
		output: boolean;
	};

	recordings: { input: undefined; output: VoiceRecording[] };
	afterRecording: { input: string; output: string | null };
	outputAction: { input: { videoPath: string; action: "open" | "reveal" }; output: boolean };
	recording: { input: string; output: VoiceRecording | null };
	audioDuration: { input: string; output: number };
	setVoiceChange: { input: { videoPath: string; enabled: boolean }; output: boolean };
	exportReady: { input: string; output: boolean };
	selectMic: { input: { videoPath: string; selection: "original" | "changed" }; output: boolean };
	start: { input: string | { videoPath: string; settings: VoiceSettings }; output: string };
	models: { input: undefined; output: VoiceModel[] };
	chooseVoice: {
		input: { voiceId: string; name: string; publicOwnerId?: string | null };
		output: VoiceSettings & { hasKey: boolean };
	};
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
	onSettingsChanged(callback: () => void): () => void;
	onPresetsChanged(callback: () => void): () => void;
	onImportRequested(callback: () => void): () => void;
	onAudioChanged(callback: (videoPath: string) => void): () => void;
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
