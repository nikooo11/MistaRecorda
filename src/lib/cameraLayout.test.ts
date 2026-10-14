import { describe, expect, it } from "vitest";
import {
	cameraLayoutAt,
	cameraOverlayAt,
	cameraPosition,
	cameraRect,
	DEFAULT_CAMERA_LAYOUT,
	editCameraOverlayAt,
	normalizeCameraCues,
	normalizeCameraLayout,
} from "./cameraLayout";
import { DEFAULT_WEBCAM_OVERLAY } from "../components/video-editor/types";
import {
	getWebcamOverlayDimensionsPx,
	getWebcamOverlayPosition,
} from "../components/video-editor/webcamOverlay";

describe("recorded camera layout", () => {
	it("corrects the playhead without replacing earlier or later movement", () => {
		const cues = [0, 2000, 4000, 6000].map((timeMs, i) => ({
			timeMs,
			layout: { ...DEFAULT_CAMERA_LAYOUT, x: i / 3 },
		}));
		const webcam = { ...DEFAULT_WEBCAM_OVERLAY, layoutCues: cues };
		const corrected = editCameraOverlayAt(cameraOverlayAt(webcam, 4000), 4000, {
			positionX: 0.25,
			positionY: 0.5,
		});
		expect(corrected.layoutCues).toHaveLength(4);
		expect(corrected.layoutCues?.filter((c) => c.timeMs !== 4000)).toEqual(
			cues.filter((c) => c.timeMs !== 4000),
		);
		expect(cameraOverlayAt(corrected, 4000)).toMatchObject({ positionX: 0.25, positionY: 0.5 });
		expect(cameraOverlayAt(corrected, 3000).positionX).toBeCloseTo((1 / 3 + 0.25) / 2);
		expect(cameraOverlayAt(corrected, 6000).positionX).toBe(1);
		expect(webcam.layoutCues).toEqual(cues);
	});
	it("adds points to static footage and retains crop edits, dimensions and non-placement settings", () => {
		const original = { ...DEFAULT_WEBCAM_OVERLAY, positionX: 0.2, positionY: 0.3 };
		const cropRegion = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
		const edited = editCameraOverlayAt(original, 2000, {
			positionX: 0.8,
			width: 75,
			height: 40,
			cropRegion,
		});
		expect(edited.layoutCues?.map((c) => c.timeMs)).toEqual([0, 2000]);
		expect(cameraOverlayAt(edited, 0).positionX).toBe(0.2);
		expect(cameraOverlayAt(edited, 2000)).toMatchObject({
			positionX: 0.8,
			width: 75,
			height: 40,
			cropRegion,
		});
		const shadow = editCameraOverlayAt(edited, 1000, { shadow: 0.4 });
		expect(shadow.layoutCues).toBe(edited.layoutCues);
		expect(shadow.shadow).toBe(0.4);
		expect(cameraOverlayAt({ ...edited, reactToZoom: true }, 1000).reactToZoom).toBe(true);
		expect(cameraOverlayAt({ ...edited, reactToZoom: false }, 1000).reactToZoom).toBe(false);
		expect(normalizeCameraCues(edited.layoutCues)).toEqual(edited.layoutCues);
	});
	it("rejects invalid imported values and clamps off-screen positions", () => {
		expect(
			normalizeCameraLayout({
				x: -4,
				y: 5,
				size: Infinity,
				roundness: 200,
				mirror: "false",
				locked: 1,
			}),
		).toEqual({ ...DEFAULT_CAMERA_LAYOUT, x: 0, y: 1, roundness: 100 });
		expect(
			normalizeCameraCues([
				{ timeMs: -1, layout: {} },
				{ timeMs: NaN, layout: {} },
				{ timeMs: 200, layout: { x: 1 } },
				{ timeMs: 0, layout: { x: 0 } },
			])?.map((c) => c.timeMs),
		).toEqual([0, 200]);
	});
	it("interpolates a drag and holds the first/last placement outside its range", () => {
		const a = { ...DEFAULT_CAMERA_LAYOUT, x: 0, y: 0, size: 20 },
			b = { ...a, x: 1, y: 1, size: 40, mirror: false };
		const cues = [
			{ timeMs: 0, layout: a },
			{ timeMs: 1000, layout: a },
			{ timeMs: 1200, layout: b },
		];
		expect(cameraLayoutAt(cues, -1)).toEqual(a);
		expect(cameraLayoutAt(cues, 900)).toEqual(a);
		expect(cameraLayoutAt(cues, 1100)).toEqual({ ...a, x: 0.5, y: 0.5, size: 30 });
		expect(cameraLayoutAt(cues, 1200)).toEqual(b);
		expect(cameraLayoutAt(cues, 2000)).toEqual(b);
	});
	it("uses the latest position at a repeated timestamp, including changes while paused", () => {
		expect(
			cameraLayoutAt(
				[
					{ timeMs: 0, layout: DEFAULT_CAMERA_LAYOUT },
					{ timeMs: 0, layout: { ...DEFAULT_CAMERA_LAYOUT, x: 0 } },
				],
				0,
			).x,
		).toBe(0);
	});
	it("maps native drag positions to the same geometry used by preview and export", () => {
		const bounds = { x: -1920, y: 30, width: 1920, height: 1080 };
		const layout = { ...DEFAULT_CAMERA_LAYOUT, x: 0.25, y: 0.75, size: 30 };
		const rect = cameraRect(layout, bounds),
			position = cameraPosition(rect, bounds);
		expect(position.x).toBeCloseTo(layout.x, 2);
		expect(position.y).toBeCloseTo(layout.y, 2);
		const webcam = cameraOverlayAt(
			{ ...DEFAULT_WEBCAM_OVERLAY, reactToZoom: false, layoutCues: [{ timeMs: 0, layout }] },
			1000,
		);
		const dimensions = getWebcamOverlayDimensionsPx({
			containerWidth: bounds.width,
			containerHeight: bounds.height,
			widthPercent: webcam.width,
			heightPercent: webcam.height,
			margin: webcam.margin,
			zoomScale: 2,
			reactToZoom: webcam.reactToZoom,
		});
		const exported = getWebcamOverlayPosition({
			containerWidth: bounds.width,
			containerHeight: bounds.height,
			...dimensions,
			margin: webcam.margin,
			positionPreset: webcam.positionPreset,
			positionX: webcam.positionX,
			positionY: webcam.positionY,
			legacyCorner: webcam.corner,
		});
		expect(Math.round(exported.x) + bounds.x).toBe(rect.x);
		expect(Math.round(exported.y) + bounds.y).toBe(rect.y);
		expect(dimensions.width).toBe(rect.width);
	});
	it("keeps old projects unchanged and clamps dragged cameras inside the source", () => {
		expect(cameraOverlayAt(DEFAULT_WEBCAM_OVERLAY, 50)).toBe(DEFAULT_WEBCAM_OVERLAY);
		expect(
			cameraPosition(
				{ x: -100, y: 900, width: 100, height: 100 },
				{ x: 0, y: 0, width: 600, height: 400 },
			),
		).toEqual({ x: 0, y: 1 });
	});
});
