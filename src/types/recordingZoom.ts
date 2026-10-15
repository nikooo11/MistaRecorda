import type { ZoomDepth, ZoomRegion } from "../components/video-editor/types";

export const RECORDING_ZOOM_KEYS = [
	..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
	"Space",
	"Up",
	"Down",
	"Left",
	"Right",
	...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
];
export interface RecordingZoomSettings {
	enabled: boolean;
	key: string;
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	meta: boolean;
	depth: ZoomDepth;
}
export const defaultRecordingZoomSettings: RecordingZoomSettings = {
	enabled: true,
	key: "Z",
	ctrl: false,
	alt: false,
	shift: false,
	meta: false,
	depth: 3,
};
export interface RecordingZoomStatus {
	settings: RecordingZoomSettings;
	recording: boolean;
	holding: boolean;
	following: boolean;
	count: number;
	hookReady: boolean;
	outlineAvailable: boolean;
}
export interface RecordingZoomAPI {
	getStatus(): Promise<RecordingZoomStatus>;
	saveSettings(settings: RecordingZoomSettings): Promise<{ success: boolean; error?: string }>;
	openSettings(toggle?: boolean): Promise<void>;
	getRegions(videoPath: string): Promise<{ success: boolean; regions: ZoomRegion[] }>;
	onStatus(callback: (status: RecordingZoomStatus) => void): () => void;
}
export function recordingZoomShortcut(settings: RecordingZoomSettings) {
	return [
		settings.ctrl && "Ctrl",
		settings.alt && "Alt",
		settings.shift && "Shift",
		settings.meta && "Meta",
		settings.key,
	]
		.filter(Boolean)
		.join("+");
}
