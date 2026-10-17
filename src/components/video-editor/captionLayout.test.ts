import { describe, expect, it } from "vitest";
import { buildActiveCaptionLayout, flattenCaptionWords } from "./captionLayout";
import { DEFAULT_AUTO_CAPTION_SETTINGS, type CaptionCue } from "./types";
import { captionPresetSettings } from "./captionPresets";

describe("flattenCaptionWords", () => {
	it("forces a break at every cue boundary so each phrase shows on its own", () => {
		const cues: CaptionCue[] = [
			{
				id: "a",
				startMs: 0,
				endMs: 1_000,
				text: "hello world",
				words: [
					{ text: "hello", startMs: 0, endMs: 500 },
					{ text: "world", startMs: 500, endMs: 1_000, leadingSpace: true },
				],
			},
			{
				// back-to-back with cue "a" (no gap) — would previously be re-packed by width
				id: "b",
				startMs: 1_000,
				endMs: 2_000,
				text: "next one",
				words: [
					{ text: "next", startMs: 1_000, endMs: 1_500 },
					{ text: "one", startMs: 1_500, endMs: 2_000, leadingSpace: true },
				],
			},
		];

		const flattened = flattenCaptionWords(cues);
		const firstWordOfSecondCue = flattened.find(
			(word) => word.cueId === "b" && word.cueWordIndex === 0,
		);

		expect(firstWordOfSecondCue?.forcedBreakBefore).toBe(true);
		expect(firstWordOfSecondCue?.leadingSpace).toBe(false);
		// the very first word of the first cue never forces a break
		expect(flattened[0].forcedBreakBefore).toBe(false);
	});
});

describe("speech-aligned highlight", () => {
	const cues: CaptionCue[] = [
		{
			id: "speech",
			startMs: 0,
			endMs: 1500,
			text: "One two three four",
			words: [
				{ text: "One", startMs: 100, endMs: 200 },
				{ text: "two", startMs: 300, endMs: 450, leadingSpace: true },
				{ text: "three", startMs: 450, endMs: 600, leadingSpace: true },
				{ text: "four", startMs: 1200, endMs: 1300, leadingSpace: true },
			],
		},
	];
	const at = (timeMs: number, preset: "highlight" | "single" = "highlight") =>
		buildActiveCaptionLayout({
			cues,
			timeMs,
			settings: { ...DEFAULT_AUTO_CAPTION_SETTINGS, ...captionPresetSettings(preset) },
			maxWidthPx: 1200,
			measureText: (text) => text.length * 10,
		});
	it("highlights only from spoken onset to offset, with no previous-word highlight in pauses", () => {
		for (const time of [200, 250]) {
			const layout = at(time)!;
			expect(layout.activeWordIndex).toBe(-1);
			expect(
				layout.visibleLines
					.flatMap((line) => line.words)
					.some((word) => word.state === "active"),
			).toBe(false);
		}
		expect(at(300)?.activeWordIndex).toBe(1);
		expect(at(450)?.activeWordIndex).toBe(2);
		expect(at(99)).toBeNull();
		expect(at(800)).toBeNull();
		expect(at(1300)).toBeNull();
	});
	it("switches single words at the exact onset and disappears immediately after pronunciation", () => {
		expect(at(200, "single")).toBeNull();
		expect(at(450, "single")?.visibleLines[0].words[0].text).toBe("three");
		expect(at(600, "single")).toBeNull();
		expect(at(1200, "single")?.opacity).toBe(1);
	});
});
