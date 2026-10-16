export type ObjectRect = { x: number; y: number; width: number; height: number };
export type CanvasView = {
	offsetLeft: number;
	offsetTop: number;
	scrollX: number;
	scrollY: number;
	zoom: number;
};
export function scenePoint(x: number, y: number, view: CanvasView) {
	return {
		x: (x - view.offsetLeft) / view.zoom - view.scrollX,
		y: (y - view.offsetTop) / view.zoom - view.scrollY,
	};
}
export function draftRect(
	x: number,
	y: number,
	ratio: number,
	view: CanvasView,
	screenWidth = 240,
): ObjectRect {
	const point = scenePoint(x, y, view);
	const width = Math.max(16, Math.min(4000, screenWidth / view.zoom));
	const height = width / ratio;
	return { x: point.x - width / 2, y: point.y - height / 2, width, height };
}
export function dragObject(
	rect: ObjectRect,
	dx: number,
	dy: number,
	zoom: number,
	corner?: string,
): ObjectRect {
	if (!corner) return { ...rect, x: rect.x + dx / zoom, y: rect.y + dy / zoom };
	const signX = corner.includes("w") ? -1 : 1;
	const signY = corner.includes("n") ? -1 : 1;
	const ratio = rect.height / rect.width;
	const delta = (dx * signX + dy * signY * ratio) / (1 + ratio * ratio) / zoom;
	const width = Math.max(16, Math.min(4000, rect.width + delta));
	const height = width * ratio;
	return {
		x: rect.x + (signX < 0 ? rect.width - width : 0),
		y: rect.y + (signY < 0 ? rect.height - height : 0),
		width,
		height,
	};
}
