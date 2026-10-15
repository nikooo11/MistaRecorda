import { expect, test } from "vitest";
import { resizeScreenLayer } from "./screenLayerResize";
import { computePaddedLayout } from "./videoPlayback/layoutUtils";
import { normalizeProjectEditor } from "./projectPersistence";
const padding = { top: 20, bottom: 20, left: 20, right: 20, linked: true };
const args = {
	width: 1920,
	height: 1080,
	videoWidth: 1920,
	videoHeight: 1080,
	cropRegion: { x: 0, y: 0, width: 1, height: 1 },
};
test("edge resize preserves center and aspect ratio in preview, persistence, and export", () => {
	const initial = computePaddedLayout({ ...args, padding });
	const rect = {
		x: initial.centerOffsetX,
		y: initial.centerOffsetY,
		width: initial.croppedDisplayWidth,
		height: initial.croppedDisplayHeight,
	};
	const changed = resizeScreenLayer(padding, rect, args, "e", -rect.width / 8, 0);
	expect(changed.scale).toBeCloseTo(0.75);
	const reopened = normalizeProjectEditor({ padding: changed }).padding;
	const exported = computePaddedLayout({ ...args, padding: reopened });
	expect(exported.croppedDisplayWidth / exported.croppedDisplayHeight).toBeCloseTo(16 / 9);
	expect(exported.croppedDisplayWidth).toBeCloseTo(rect.width * 0.75);
	expect(exported.centerOffsetX + exported.croppedDisplayWidth / 2).toBeCloseTo(960);
	const preview = computePaddedLayout({ ...args, width: 960, height: 540, padding: reopened });
	expect(preview.croppedDisplayWidth * 2).toBeCloseTo(exported.croppedDisplayWidth);
});
test("all corners resize proportionally and cannot exceed the output frame", () => {
	const rect = { x: 160, y: 90, width: 1600, height: 900 };
	for (const handle of ["ne", "nw", "se", "sw"] as const) {
		const small = resizeScreenLayer(
			padding,
			rect,
			args,
			handle,
			handle.includes("e") ? -160 : 160,
			handle.includes("s") ? -90 : 90,
		);
		expect(small.scale).toBeCloseTo(0.8);
		const huge = resizeScreenLayer(
			padding,
			rect,
			args,
			handle,
			handle.includes("e") ? 10000 : -10000,
			handle.includes("s") ? 10000 : -10000,
		);
		expect(huge.scale).toBeCloseTo(1.2);
	}
});
