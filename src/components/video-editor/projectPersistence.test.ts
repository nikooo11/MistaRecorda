import { DEFAULT_CAMERA_LAYOUT } from "../../lib/cameraLayout";
import { describe, expect, it } from "vitest";

import { normalizeProjectEditor } from "./projectPersistence";
import { ADVANCED_VERTICAL_PADDING_MAX } from "./types";

describe("normalizeProjectEditor", () => {
	it("preserves recorded camera motion and hidden layers through save/reopen", () => {
		const layoutCues = [
			{ timeMs: 0, layout: DEFAULT_CAMERA_LAYOUT },
			{ timeMs: 1200, layout: { ...DEFAULT_CAMERA_LAYOUT, x: 0, y: 0 } },
		];
		const editor = normalizeProjectEditor({
			webcam: { layoutCues },
			annotationRegions: [
				{
					id: "hidden",
					type: "text",
					hidden: true,
					startMs: 0,
					endMs: 2000,
					content: "Do not render",
					position: { x: 50, y: 50 },
					size: { width: 20, height: 10 },
					zIndex: 1,
				},
			],
		});
		const reopened = normalizeProjectEditor(JSON.parse(JSON.stringify(editor)));
		expect(reopened.webcam.layoutCues).toEqual(layoutCues);
		expect(reopened.annotationRegions[0]?.hidden).toBe(true);
	});
	it("preserves recorded camera toggles through a project round trip", () => {
		const visibility = [
			{ timeMs: 0, visible: true },
			{ timeMs: 1200, visible: false },
			{ timeMs: 3000, visible: true },
		];
		const editor = normalizeProjectEditor({ webcam: { visibility } });
		expect(
			normalizeProjectEditor(JSON.parse(JSON.stringify(editor))).webcam.visibility,
		).toEqual(visibility);
	});
	it("preserves the extended advanced vertical padding range", () => {
		const editor = normalizeProjectEditor({
			padding: {
				top: 240,
				bottom: ADVANCED_VERTICAL_PADDING_MAX,
				left: 22,
				right: 22,
				linked: false,
			},
		});

		expect(editor.padding).toMatchObject({
			top: 240,
			bottom: ADVANCED_VERTICAL_PADDING_MAX,
			left: 22,
			right: 22,
			linked: false,
		});
	});

	it("keeps linked padding clamped to the original range", () => {
		const editor = normalizeProjectEditor({
			padding: {
				top: ADVANCED_VERTICAL_PADDING_MAX,
				bottom: ADVANCED_VERTICAL_PADDING_MAX,
				left: ADVANCED_VERTICAL_PADDING_MAX,
				right: ADVANCED_VERTICAL_PADDING_MAX,
				linked: true,
			},
		});

		expect(editor.padding).toMatchObject({
			top: 100,
			bottom: 100,
			left: 100,
			right: 100,
			linked: true,
		});
	});
});
