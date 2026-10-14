import type { AudioRegion } from "../components/video-editor/types";
export interface StudioSource {
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
}
export interface WindowSlot {
	slot: number;
	shortcut: string;
	source: StudioSource;
}
export interface StudioSettings {
	glow: boolean;
	windows: WindowSlot[];
	sounds: SoundEffect[];
	cameraShortcut: string;
	cameraLayout: import("../lib/cameraLayout").CameraLayout;
	scenes: RecordingScene[];
}
export interface RecordingScene {
	id: string;
	name: string;
	source: StudioSource;
	camera: boolean;
	cameraLayout?: import("../lib/cameraLayout").CameraLayout;
	shortcut: string;
}
export type StudioTab = "windows" | "sounds" | "controls" | "scenes" | "layers";
export interface StudioInfo {
	panelTab?: StudioTab;
	settings: StudioSettings;
	camera?: { enabled: boolean; deviceId?: string; preview: boolean; error?: string };
	recording: boolean;
	switching: boolean;
	canSwitch: boolean;
	selectedName: string;
	message: string;
}
export interface StudioAPI {
	request<T = StudioInfo>(method: string, input?: unknown): Promise<T>;
	onChanged(callback: (info: StudioInfo) => void): () => void;
	getSounds(path: string): Promise<AudioRegion[]>;
}
