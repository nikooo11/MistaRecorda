import type { AudioRegion } from "../components/video-editor/types";
export interface StudioSource {
	thumbnail?: string | null;
	appIcon?: string | null;
	id: string;
	name: string;
	appName?: string;
	windowTitle?: string;
	display_id?: string;
	sourceType: "window" | "screen";
}
export interface SoundEffect {
	id: string;
	name: string;
	file: string;
	durationMs: number;
	shortcut: string;
	volume: number;
	favorite?: boolean;
	loved?: boolean;
	color?: string;
}
export interface WindowSlot {
	slot: number;
	shortcut: string;
	source: StudioSource;
}
export interface StudioSettings {
	sourceAliases?: Array<{ source: StudioSource; name: string }>;
	glow: boolean;
	includeSoundboardInRecording?: boolean;
	windows: WindowSlot[];
	sounds: SoundEffect[];
	installedDefaultSoundIds?: string[];
	cameraShortcut: string;
	cameraLayout: import("../lib/cameraLayout").CameraLayout;
	scenes: RecordingScene[];
}
export interface RecordingScene {
	media?: SceneMediaSource[];
	audio?: { microphone: boolean; system: boolean };
	id: string;
	name: string;
	source: StudioSource;
	camera: boolean;
	cameraLayout?: import("../lib/cameraLayout").CameraLayout;
	shortcut: string;
}
export interface SceneMediaSource {
	id: string;
	name: string;
	kind: "image" | "video" | "audio";
	file: string;
	enabled: boolean;
	x: number;
	y: number;
	width: number;
	height: number;
	opacity: number;
	volume: number;
	loop: boolean;
	durationMs?: number;
	hasAudio: boolean;
}
export interface SceneMediaPlayback {
	sceneId?: string;
	elapsedMs: number;
	playing: boolean;
	sources: Array<SceneMediaSource & { url: string }>;
}
export type StudioTab = "windows" | "sounds" | "controls" | "scenes" | "layers" | "setup";
export interface StudioInfo {
	activeSceneId?: string;
	audio?: { microphone: boolean; system: boolean };
	guideTour?: import("../components/settings-guide/settingHelpContent").SettingsTourRequest;
	panelTab?: StudioTab;
	settings: StudioSettings;
	camera?: { enabled: boolean; deviceId?: string; preview: boolean; error?: string };
	recording: boolean;
	switching: boolean;
	canSwitch: boolean;
	selectedName: string;
	selectedSource?: StudioSource;
	message: string;
}
export interface StudioAPI {
	request<T = StudioInfo>(method: string, input?: unknown): Promise<T>;
	onChanged(callback: (info: StudioInfo) => void): () => void;
	onAudioCommand(
		callback: (command: { id: string; method: string; input?: unknown }) => void,
	): () => void;
	getSounds(path: string): Promise<AudioRegion[]>;
}
