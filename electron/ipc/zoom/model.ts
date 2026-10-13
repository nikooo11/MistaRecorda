import type { ZoomDepth, ZoomFocus, ZoomRegion } from "../../../src/components/video-editor/types";
import { ZOOM_DEPTH_SCALES } from "../../../src/components/video-editor/types";
import { RECORDING_ZOOM_KEYS, type RecordingZoomSettings } from "../../../src/types/recordingZoom";

export function validateZoomSettings(value: unknown): RecordingZoomSettings {
	const s = value as RecordingZoomSettings;
	if (
		!s ||
		!RECORDING_ZOOM_KEYS.includes(s.key) ||
		![1, 2, 3, 4, 5, 6].includes(s.depth) ||
		![s.enabled, s.ctrl, s.alt, s.shift, s.meta].every((x) => typeof x === "boolean")
	)
		throw new Error("invalidSettings");
	return {
		enabled: s.enabled,
		key: s.key,
		ctrl: s.ctrl,
		alt: s.alt,
		shift: s.shift,
		meta: s.meta,
		depth: s.depth,
	};
}
export function zoomTarget(focus: ZoomFocus, depth: ZoomDepth) {
	const size = 1 / ZOOM_DEPTH_SCALES[depth];
	const cx = Math.min(1 - size / 2, Math.max(size / 2, focus.cx));
	const cy = Math.min(1 - size / 2, Math.max(size / 2, focus.cy));
	return { cx, cy, x: cx - size / 2, y: cy - size / 2, width: size, height: size };
}
export class HeldZoomCapture {
	regions: ZoomRegion[] = [];
	active: ZoomRegion | null = null;
	press(timeMs: number, focus: ZoomFocus, depth: ZoomDepth) {
		if (this.active || this.regions.length >= 4096) return;
		const target = zoomTarget(focus, depth);
		this.active = {
			id: `held-${crypto.randomUUID()}`,
			startMs: Math.max(0, Math.round(timeMs)),
			endMs: 0,
			depth,
			focus: { cx: target.cx, cy: target.cy },
			mode: "manual",
		};
	}
	release(timeMs: number) {
		if (!this.active) return;
		const region = { ...this.active, endMs: Math.max(this.active.startMs, Math.round(timeMs)) };
		this.active = null;
		if (region.endMs - region.startMs >= 100) this.regions.push(region);
	}
}
export function normalizeRecordedZooms(value: unknown): ZoomRegion[] {
	if (!Array.isArray(value)) return [];
	return value
		.slice(0, 4096)
		.filter((r): r is ZoomRegion =>
			Boolean(
				r &&
					typeof r.id === "string" &&
					/^held-[a-zA-Z0-9-]+$/.test(r.id) &&
					Number.isFinite(r.startMs) &&
					r.startMs >= 0 &&
					Number.isFinite(r.endMs) &&
					r.endMs > r.startMs &&
					[1, 2, 3, 4, 5, 6].includes(r.depth) &&
					r.focus &&
					[r.focus.cx, r.focus.cy].every((n) => Number.isFinite(n) && n >= 0 && n <= 1),
			),
		)
		.map((r) => ({
			id: r.id,
			startMs: r.startMs,
			endMs: r.endMs,
			depth: r.depth,
			focus: { cx: r.focus.cx, cy: r.focus.cy },
			mode: "manual",
		}));
}
export function canShowZoomOutline(platform: string, release: string, nativeMacExcluded: boolean) {
	if (platform === "darwin") return nativeMacExcluded;
	// WDA_EXCLUDEFROMCAPTURE requires Windows 10 2004 (19041) or later.
	return platform === "win32" && Number(release.split(".")[2]) >= 19041;
}
