import { z } from "zod";
export const captureRectSchema = z.object({
	x: z.number().finite(),
	y: z.number().finite(),
	width: z.number().finite().positive(),
	height: z.number().finite().positive(),
});
export type CaptureRect = z.infer<typeof captureRectSchema>;
export type VerticalInfo = {
	enabled: boolean;
	available: boolean;
	displayId: number;
	frame: CaptureRect;
	display: CaptureRect;
	safeAreas: boolean;
	locked: boolean;
};
export function verticalRect(display: CaptureRect, requested?: Partial<CaptureRect>): CaptureRect {
	const height = Math.min(
		display.height,
		(display.width * 16) / 9,
		Math.max(Math.min(320, display.height), requested?.height ?? display.height * 0.85),
	);
	const width = (height * 9) / 16;
	return {
		x: Math.min(
			display.x + display.width - width,
			Math.max(display.x, requested?.x ?? display.x + (display.width - width) / 2),
		),
		y: Math.min(
			display.y + display.height - height,
			Math.max(display.y, requested?.y ?? display.y + (display.height - height) / 2),
		),
		width,
		height,
	};
}
export function insideCapture(item: CaptureRect, frame: CaptureRect): CaptureRect {
	const scale = Math.min(1, frame.width / item.width, frame.height / item.height),
		width = item.width * scale,
		height = item.height * scale;
	return {
		x: Math.max(frame.x, Math.min(item.x, frame.x + frame.width - width)),
		y: Math.max(frame.y, Math.min(item.y, frame.y + frame.height - height)),
		width,
		height,
	};
}
export function captureSceneFrame(
	frame: CaptureRect,
	scene: { zoom: number; scrollX: number; scrollY: number },
): CaptureRect {
	return {
		x: frame.x / scene.zoom - scene.scrollX,
		y: frame.y / scene.zoom - scene.scrollY,
		width: frame.width / scene.zoom,
		height: frame.height / scene.zoom,
	};
}
