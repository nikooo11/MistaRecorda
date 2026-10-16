import type { CameraLayoutCue } from "../lib/cameraLayout";
import type { WebcamVisibilityEvent } from "../lib/webcamVisibility";

/** A new take joined onto the end of the recording the editor had open. */
export interface AppendedClip {
	videoPath: string;
	webcamPath: string | null;
	basePath: string;
	firstDurationMs: number;
	secondDurationMs: number;
	firstHadWebcam: boolean;
	second: {
		hasWebcam: boolean;
		visibility?: WebcamVisibilityEvent[];
		layoutCues?: CameraLayoutCue[];
	};
}
export interface ClipRecordingTarget {
	videoPath: string;
	webcamPath?: string | null;
}
export interface ClipsAPI {
	status: () => Promise<{ pending: boolean }>;
	/** Hides the editor and opens the recorder; the next take is appended to this recording. */
	record: () => Promise<{ pending: boolean }>;
	/** Leaves the recorder without recording and returns to the editor. */
	cancel: () => Promise<{ pending: boolean }>;
	append: () => Promise<AppendedClip>;
	discard: (input: ClipRecordingTarget) => Promise<{ success: boolean }>;
	discardAndRecord: (input: ClipRecordingTarget) => Promise<{ success: boolean }>;
	recordingFinalized: (videoPath: string) => void;
	onPendingChanged: (callback: (pending: boolean) => void) => () => void;
	onRecordingFinalized: (callback: (videoPath: string) => void) => () => void;
}
