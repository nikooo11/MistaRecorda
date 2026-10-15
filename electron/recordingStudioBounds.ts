export interface StudioBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}
/** Keep a saved studio reachable after resolution or monitor changes. */
export function recordingStudioBounds(
	area: StudioBounds,
	saved?: Partial<StudioBounds>,
): StudioBounds {
	const valid = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
	const width = Math.min(area.width, Math.max(820, valid(saved?.width) ? saved.width : 1140));
	const height = Math.min(area.height, Math.max(600, valid(saved?.height) ? saved.height : 760));
	return {
		width: Math.round(width),
		height: Math.round(height),
		x: Math.round(
			Math.max(
				area.x,
				Math.min(
					area.x + area.width - width,
					valid(saved?.x) ? saved.x : area.x + (area.width - width) / 2,
				),
			),
		),
		y: Math.round(
			Math.max(
				area.y,
				Math.min(
					area.y + area.height - height,
					valid(saved?.y) ? saved.y : area.y + (area.height - height) / 2,
				),
			),
		),
	};
}
