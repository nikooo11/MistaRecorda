import type { Padding } from "./types";

export type ScreenResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type ScreenRect = { x: number; y: number; width: number; height: number };

/** Resize around the frame center; preserve aspect ratio and existing padding/placement. */
export function resizeScreenLayer(
	padding: Padding,
	rect: ScreenRect,
	stage: { width: number; height: number },
	handle: ScreenResizeHandle,
	dx: number,
	dy: number,
): Padding {
	if (rect.width <= 0 || rect.height <= 0) return padding;
	const x = handle.includes("e") ? dx : handle.includes("w") ? -dx : 0;
	const y = handle.includes("s") ? dy : handle.includes("n") ? -dy : 0;
	const horizontal = handle.includes("e") || handle.includes("w");
	const vertical = handle.includes("n") || handle.includes("s");
	// Project a corner drag onto the aspect-ratio diagonal; edges control one axis.
	const delta =
		horizontal && vertical
			? (2 * (x * rect.width + y * rect.height)) / (rect.width ** 2 + rect.height ** 2)
			: horizontal
				? (2 * x) / rect.width
				: (2 * y) / rect.height;
	const initial = padding.scale ?? 1;
	const max = Math.min(
		2,
		(initial * stage.width) / rect.width,
		(initial * stage.height) / rect.height,
	);
	return { ...padding, scale: Math.min(max, Math.max(0.1, initial * (1 + delta))) };
}
