import { type CameraLayoutCue, cameraLayoutAt } from "../../lib/cameraLayout";
import { isWebcamVisible, type WebcamVisibilityEvent } from "../../lib/webcamVisibility";
import type { AppendedClip } from "../../types/clips";
import type { EditorProjectData, ProjectEditorState } from "./projectPersistence";
import { type AudioRegion, clipsToTrims, type ZoomRegion } from "./types";

/** Visibility is in source time; the new take starts with its own first state at the join. */
export function joinWebcamVisibility(
	first: WebcamVisibilityEvent[] | undefined,
	firstHadWebcam: boolean,
	second: WebcamVisibilityEvent[] | undefined,
	secondHasWebcam: boolean,
	offsetMs: number,
): WebcamVisibilityEvent[] {
	const before = firstHadWebcam
		? first?.length
			? first
			: [{ timeMs: 0, visible: true }]
		: [{ timeMs: 0, visible: false }];
	return [
		...(before[0].timeMs > 0 ? [{ timeMs: 0, visible: false }] : []),
		...before.filter((e) => e.timeMs < offsetMs),
		{ timeMs: offsetMs, visible: secondHasWebcam && isWebcamVisible(second, 0) },
		...(secondHasWebcam ? (second ?? []) : [])
			.filter((e) => e.timeMs > 0)
			.map((e) => ({ ...e, timeMs: e.timeMs + offsetMs })),
	];
}

/** Recorded camera moves continue from where each take left off, without easing across the cut. */
export function joinCameraCues(
	first: CameraLayoutCue[] | undefined,
	second: CameraLayoutCue[] | undefined,
	offsetMs: number,
): CameraLayoutCue[] | undefined {
	if (!first?.length) return undefined;
	const before = first.filter((c) => c.timeMs < offsetMs - 1);
	return [
		...before,
		{ timeMs: Math.max(0, offsetMs - 1), layout: cameraLayoutAt(first, offsetMs - 1) },
		...(second?.length
			? [
					{ timeMs: offsetMs, layout: cameraLayoutAt(second, 0) },
					...second
						.filter((c) => c.timeMs > 0)
						.map((c) => ({ ...c, timeMs: c.timeMs + offsetMs })),
				]
			: []),
	];
}

/**
 * The joined recording starts with the original take, so every existing edit keeps its time.
 * The new take is added as one more clip after it, with its recorded zooms and sounds.
 */
export function mergeAppendedClip(
	project: EditorProjectData & { editor: ProjectEditorState },
	clip: AppendedClip,
	added: { zoomRegions: ZoomRegion[]; audioRegions: AudioRegion[] },
	clipId: string,
): EditorProjectData & { editor: ProjectEditorState } {
	const editor = project.editor;
	const offsetMs = clip.firstDurationMs;
	const totalMs = offsetMs + clip.secondDurationMs;
	const existing = editor.clipRegions.length
		? editor.clipRegions
		: [{ id: "clip-1", startMs: 0, endMs: offsetMs, speed: 1 }];
	const clipRegions = [...existing, { id: clipId, startMs: offsetMs, endMs: totalMs, speed: 1 }];
	const webcam = clip.webcamPath
		? {
				...editor.webcam,
				enabled: clip.firstHadWebcam ? editor.webcam.enabled : true,
				sourcePath: clip.webcamPath,
				timeOffsetMs: 0,
				visibility: joinWebcamVisibility(
					editor.webcam.visibility,
					clip.firstHadWebcam,
					clip.second.visibility,
					clip.second.hasWebcam,
					offsetMs,
				),
				layoutCues: joinCameraCues(
					editor.webcam.layoutCues,
					clip.second.layoutCues,
					offsetMs,
				),
			}
		: editor.webcam;
	return {
		...project,
		videoPath: clip.videoPath,
		editor: {
			...editor,
			clipRegions,
			trimRegions: clipsToTrims(clipRegions, totalMs),
			zoomRegions: [...editor.zoomRegions, ...added.zoomRegions],
			audioRegions: [...editor.audioRegions, ...added.audioRegions],
			webcam,
		},
	};
}
