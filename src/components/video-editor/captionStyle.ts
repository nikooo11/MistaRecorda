import type { CaptionWordState } from "./captionLayout";
import { DEFAULT_AUTO_CAPTION_SETTINGS, type AutoCaptionSettings } from "./types";

export const CAPTION_FONT_WEIGHT = 400;
export const CAPTION_LINE_HEIGHT = 1.32;

const DEFAULT_CAPTION_REFERENCE_WIDTH = 1920 * (DEFAULT_AUTO_CAPTION_SETTINGS.maxWidth / 100);

export function getCaptionTargetWidth(containerWidth: number, maxWidthPercent: number) {
	return Math.max(1, containerWidth * (maxWidthPercent / 100));
}

export function getCaptionScaledFontSize(
	fontSize: number,
	containerWidth: number,
	maxWidthPercent: number,
) {
	return Math.max(
		14,
		fontSize *
			(getCaptionTargetWidth(containerWidth, maxWidthPercent) /
				DEFAULT_CAPTION_REFERENCE_WIDTH),
	);
}

export function getCaptionPadding(fontSize: number) {
	return {
		x: fontSize * 0.55,
		y: fontSize * 0.2,
	};
}

export function getCaptionScaledRadius(radius: number, fontSize: number) {
	const baseline = Math.max(1, DEFAULT_AUTO_CAPTION_SETTINGS.fontSize);
	return Math.max(0, radius * (fontSize / baseline));
}

export function getCaptionTextMaxWidth(
	containerWidth: number,
	maxWidthPercent: number,
	fontSize: number,
) {
	const padding = getCaptionPadding(fontSize);
	return Math.max(
		fontSize * 4,
		getCaptionTargetWidth(containerWidth, maxWidthPercent) - padding.x * 2,
	);
}

export function getCaptionWordVisualState(
	_hasWordTimings: boolean,
	state: CaptionWordState,
	highlight = false,
) {
	return { isInactive: false, isHighlighted: highlight && state === "active", opacity: 1 };
}

export function getCaptionBackground(settings: AutoCaptionSettings) {
	const color = /^#[0-9a-f]{6}$/i.test(settings.backgroundColor ?? "")
		? settings.backgroundColor!
		: "#000000";
	const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
	return `rgba(${channels.join(", ")}, ${settings.backgroundOpacity})`;
}
