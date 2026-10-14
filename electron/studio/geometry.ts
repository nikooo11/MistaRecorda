/** Canvas coordinates stay stable when native capture letterboxes a different window. */
export function captureCanvasBounds(
	bounds: Electron.Rectangle,
	aspect: number | null,
): Electron.Rectangle {
	if (!aspect || aspect <= 0 || !Number.isFinite(aspect)) return bounds;
	const width = Math.max(bounds.width, bounds.height * aspect);
	const height = Math.max(bounds.height, bounds.width / aspect);
	return {
		x: bounds.x - (width - bounds.width) / 2,
		y: bounds.y - (height - bounds.height) / 2,
		width,
		height,
	};
}
let aspect: number | null = null;
export function setCaptureCanvasAspect(value: number | null) {
	aspect = value;
}
export function getCaptureCanvasAspect() {
	return aspect;
}
