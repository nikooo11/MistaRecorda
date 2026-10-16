export type ObjectRect = { x: number; y: number; width: number; height: number; angle?: number };
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
	const angle = rect.angle ?? 0,
		cos = Math.cos(angle),
		sin = Math.sin(angle);
	const localX = (dx * cos + dy * sin) / zoom;
	const localY = (-dx * sin + dy * cos) / zoom;
	const signX = corner.includes("w") ? -1 : corner.includes("e") ? 1 : 0;
	const signY = corner.includes("n") ? -1 : corner.includes("s") ? 1 : 0;
	const ratio = rect.height / rect.width;
	const delta = !signX
		? (localY * signY) / ratio
		: !signY
			? localX * signX
			: (localX * signX + localY * signY * ratio) / (1 + ratio * ratio);
	const width = Math.max(16, Math.min(4000, rect.width + delta));
	const height = width * ratio;
	// Keep the opposite corner/edge fixed in world space, including after tilt.
	const shiftX = (signX * (width - rect.width)) / 2;
	const shiftY = (signY * (height - rect.height)) / 2;
	return {
		...rect,
		x: rect.x + (rect.width - width) / 2 + shiftX * cos - shiftY * sin,
		y: rect.y + (rect.height - height) / 2 + shiftX * sin + shiftY * cos,
		width,
		height,
	};
}

export function normalizeTilt(angle: number) {
	return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function objectContainsPoint(rect: ObjectRect, x: number, y: number) {
	const angle = rect.angle ?? 0;
	const dx = x - rect.x - rect.width / 2,
		dy = y - rect.y - rect.height / 2;
	return (
		Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle)) <= rect.width / 2 &&
		Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle)) <= rect.height / 2
	);
}
