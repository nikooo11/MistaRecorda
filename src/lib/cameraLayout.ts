import type { WebcamOverlaySettings } from "../components/video-editor/types";

export interface CameraLayout {
	x: number;
	y: number;
	size: number;
	roundness: number;
	mirror: boolean;
	locked: boolean;
	width?: number;
	height?: number;
	margin?: number;
}
export interface CameraLayoutCue {
	timeMs: number;
	layout: CameraLayout;
}
export const DEFAULT_CAMERA_LAYOUT: CameraLayout = {
	x: 0.97,
	y: 0.97,
	size: 26,
	roundness: 90,
	mirror: true,
	locked: false,
};
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export function normalizeCameraLayout(value: unknown): CameraLayout {
	const v = (value && typeof value === "object" ? value : {}) as Partial<CameraLayout>;
	const num = (key: "x" | "y" | "size" | "roundness", min: number, max: number) =>
		clamp(Number.isFinite(v[key]) ? v[key]! : DEFAULT_CAMERA_LAYOUT[key], min, max);
	return {
		x: num("x", 0, 1),
		y: num("y", 0, 1),
		size: num("size", 10, 60),
		roundness: num("roundness", 0, 100),
		mirror: typeof v.mirror === "boolean" ? v.mirror : true,
		locked: typeof v.locked === "boolean" ? v.locked : false,
		...(Number.isFinite(v.width) ? { width: clamp(v.width!, 10, 100) } : {}),
		...(Number.isFinite(v.height) ? { height: clamp(v.height!, 10, 100) } : {}),
		...(Number.isFinite(v.margin) ? { margin: clamp(v.margin!, 0, 96) } : {}),
	};
}
export function normalizeCameraCues(value: unknown): CameraLayoutCue[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value
		.slice(0, 100000)
		.filter((v) => v && Number.isFinite(v.timeMs) && v.timeMs >= 0 && v.layout)
		.map((v) => ({ timeMs: Math.round(v.timeMs), layout: normalizeCameraLayout(v.layout) }))
		.sort((a, b) => a.timeMs - b.timeMs);
}
export function cameraLayoutAt(cues: CameraLayoutCue[], timeMs: number): CameraLayout {
	let low = 0,
		high = cues.length - 1;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if (cues[mid].timeMs <= timeMs) low = mid;
		else high = mid - 1;
	}
	const a = cues[low],
		b = cues[low + 1];
	if (!a) return DEFAULT_CAMERA_LAYOUT;
	if (!b || timeMs <= a.timeMs) return a.layout;
	const t = clamp((timeMs - a.timeMs) / Math.max(1, b.timeMs - a.timeMs), 0, 1);
	return {
		...a.layout,
		x: a.layout.x + (b.layout.x - a.layout.x) * t,
		y: a.layout.y + (b.layout.y - a.layout.y) * t,
		size: a.layout.size + (b.layout.size - a.layout.size) * t,
		...(a.layout.width !== undefined || b.layout.width !== undefined
			? {
					width:
						(a.layout.width ?? a.layout.size) +
						((b.layout.width ?? b.layout.size) - (a.layout.width ?? a.layout.size)) * t,
				}
			: {}),
		...(a.layout.height !== undefined || b.layout.height !== undefined
			? {
					height:
						(a.layout.height ?? a.layout.size) +
						((b.layout.height ?? b.layout.size) - (a.layout.height ?? a.layout.size)) *
							t,
				}
			: {}),
		...(a.layout.margin !== undefined || b.layout.margin !== undefined
			? {
					margin:
						(a.layout.margin ?? 0) +
						((b.layout.margin ?? 0) - (a.layout.margin ?? 0)) * t,
				}
			: {}),
	};
}
export function cameraOverlayAt<T extends WebcamOverlaySettings>(webcam: T, timeMs: number): T {
	if (!webcam.layoutCues?.length) return webcam;
	const layout = cameraLayoutAt(webcam.layoutCues, timeMs);
	return {
		...webcam,
		positionPreset: "custom",
		positionX: layout.x,
		positionY: layout.y,
		size: layout.size,
		width: layout.width ?? layout.size,
		height: layout.height ?? layout.size,
		margin: layout.margin ?? 0,
		cornerRadius: layout.roundness,
		mirror: layout.mirror,
	};
}

/** Add/update one source-time placement point without replacing other recorded movement. */
export function editCameraOverlayAt<T extends WebcamOverlaySettings>(
	webcam: T,
	timeMs: number,
	patch: Partial<WebcamOverlaySettings>,
): T {
	const placement = [
		"positionX",
		"positionY",
		"positionPreset",
		"width",
		"height",
		"size",
		"cornerRadius",
		"mirror",
		"margin",
	];
	if (!placement.some((key) => key in patch)) return { ...webcam, ...patch };
	const time = Math.max(0, Math.round(timeMs));
	const at = cameraOverlayAt(webcam, time);
	const base = normalizeCameraLayout({
		x: webcam.positionX,
		y: webcam.positionY,
		size: webcam.size,
		width: webcam.width,
		height: webcam.height,
		roundness: webcam.cornerRadius,
		mirror: webcam.mirror,
		margin: webcam.margin,
	});
	const next = { ...at, ...patch };
	const layout = normalizeCameraLayout({
		x: next.positionX,
		y: next.positionY,
		size: next.size,
		width: next.width,
		height: next.height,
		roundness: next.cornerRadius,
		mirror: next.mirror,
		margin: next.margin,
	});
	const cues = webcam.layoutCues?.length ? webcam.layoutCues : [{ timeMs: 0, layout: base }];
	return {
		...webcam,
		...patch,
		layoutCues: [...cues.filter((cue) => cue.timeMs !== time), { timeMs: time, layout }].sort(
			(a, b) => a.timeMs - b.timeMs,
		),
	};
}
export function cameraRect(
	layout: CameraLayout,
	bounds: { x: number; y: number; width: number; height: number },
) {
	const size = Math.max(
		56,
		Math.round((Math.min(bounds.width, bounds.height) * layout.size) / 100),
	);
	return {
		x: Math.round(bounds.x + (bounds.width - size) * layout.x),
		y: Math.round(bounds.y + (bounds.height - size) * layout.y),
		width: size,
		height: size,
	};
}
export function cameraPosition(
	rect: { x: number; y: number; width: number; height: number },
	bounds: typeof rect,
) {
	return {
		x: clamp((rect.x - bounds.x) / Math.max(1, bounds.width - rect.width), 0, 1),
		y: clamp((rect.y - bounds.y) / Math.max(1, bounds.height - rect.height), 0, 1),
	};
}
