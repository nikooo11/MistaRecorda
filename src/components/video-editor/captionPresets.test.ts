import { expect, test } from "vitest";
import { buildActiveCaptionLayout } from "./captionLayout";
import { captionPresetSettings } from "./captionPresets";
import { getCaptionBackground, getCaptionWordVisualState } from "./captionStyle";
import { updateCaptionCuesForEditedTarget } from "./captionEditing";
import { normalizeProjectEditor } from "./projectPersistence";
import { DEFAULT_AUTO_CAPTION_SETTINGS, type CaptionCue } from "./types";
const words = "Make your point clearly with accurate words".split(" ");
const cues: CaptionCue[] = [
	{
		id: "cue",
		startMs: 0,
		endMs: 3500,
		text: words.join(" "),
		words: words.map((text, i) => ({
			text,
			startMs: i * 500,
			endMs: (i + 1) * 500,
			leadingSpace: i > 0,
		})),
	},
];
for (const preset of ["highlight", "short", "single"] as const)
	test(`${preset} pages keep every word and time aligned`, () => {
		const settings = { ...DEFAULT_AUTO_CAPTION_SETTINGS, ...captionPresetSettings(preset) };
		for (let i = 0; i < words.length; i++) {
			const layout = buildActiveCaptionLayout({
				cues,
				timeMs: i * 500 + 200,
				settings,
				maxWidthPx: 1200,
				measureText: (text) => text.length * 10,
			})!;
			const shown = layout.visibleLines.flatMap((line) => line.words);
			expect(shown.length).toBeLessThanOrEqual(preset === "single" ? 1 : 3);
			expect(shown.find((word) => word.state === "active")?.text).toBe(words[i]);
		}
	});
test("highlight moves only with the active word; classic stays uniform", () => {
	expect(getCaptionWordVisualState(true, "active", true).isHighlighted).toBe(true);
	expect(getCaptionWordVisualState(true, "spoken", true).isHighlighted).toBe(false);
	expect(getCaptionWordVisualState(true, "active").isHighlighted).toBe(false);
});
test("short caption corrections preserve surrounding words and survive reopening", () => {
	const settings = { ...DEFAULT_AUTO_CAPTION_SETTINGS, ...captionPresetSettings("highlight") };
	const layout = buildActiveCaptionLayout({
		cues,
		timeMs: 700,
		settings,
		maxWidthPx: 1200,
		measureText: (text) => text.length * 10,
	})!;
	const updated = updateCaptionCuesForEditedTarget(cues, layout.editTarget, "Make this point");
	expect(updated.map((c) => c.text).join(" ")).toContain("clearly with accurate words");
	const normalized = normalizeProjectEditor({
		autoCaptionSettings: settings,
		autoCaptions: updated,
	});
	expect(normalized.autoCaptionSettings.preset).toBe("highlight");
	expect(normalized.autoCaptionSettings.wordsPerPage).toBe(3);
	expect(normalized.autoCaptionSettings.highlightColor).toBe("#68E0CF");
});

test("reference-style colors survive saving and share the same export background", () => {
	const settings = { ...DEFAULT_AUTO_CAPTION_SETTINGS, ...captionPresetSettings("highlight") };
	const normalized = normalizeProjectEditor({ autoCaptionSettings: settings });
	expect(normalized.autoCaptionSettings.backgroundColor).toBe("#FFFFFF");
	expect(normalized.autoCaptionSettings.textColor).toBe("#111111");
	expect(getCaptionBackground(normalized.autoCaptionSettings)).toBe("rgba(255, 255, 255, 0.96)");
	expect(getCaptionBackground(DEFAULT_AUTO_CAPTION_SETTINGS)).toBe("rgba(0, 0, 0, 0.9)");
});
