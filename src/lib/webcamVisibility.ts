export interface WebcamVisibilityEvent {
	timeMs: number;
	visible: boolean;
}

export function normalizeWebcamVisibility(value: unknown): WebcamVisibilityEvent[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value
		.slice(0, 10000)
		.filter(
			(v): v is WebcamVisibilityEvent =>
				v && Number.isFinite(v.timeMs) && v.timeMs >= 0 && typeof v.visible === "boolean",
		)
		.map(({ timeMs, visible }) => ({ timeMs: Math.round(timeMs), visible }))
		.sort((a, b) => a.timeMs - b.timeMs);
}

/** Times are source-media milliseconds, so trimming and playback speed do not shift cues. */
export function isWebcamVisible(events: WebcamVisibilityEvent[] | undefined, timeMs: number) {
	if (!events?.length) return true; // Existing recordings have no visibility metadata.
	let visible = false;
	for (const event of events) {
		if (event.timeMs > timeMs) break;
		visible = event.visible;
	}
	return visible;
}
