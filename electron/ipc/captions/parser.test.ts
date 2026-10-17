import { describe, expect, it } from "vitest";
import { parseWhisperJsonCues, parseWhisperJsonWords } from "./parser";

const token = (text: string, from: number, to: number) => ({ text, offsets: { from, to } });

describe("Whisper word timestamps", () => {
	it("keeps measured speech timing when full JSON contains control tokens and zero-length punctuation", () => {
		const words = parseWhisperJsonWords([
			token("[_BEG_]", 0, 0),
			token(" we", 0, 110),
			token(" are", 210, 370),
			token(" doing", 380, 610),
			token(".", 770, 1000),
			token(" Then", 1000, 1240),
			token(".", 1240, 1240),
			token("[_TT_248]", 4960, 4960),
		]);
		expect(words).toEqual([
			{ text: "we", startMs: 0, endMs: 110 },
			{ text: "are", startMs: 210, endMs: 370, leadingSpace: true },
			{ text: "doing.", startMs: 380, endMs: 610, leadingSpace: true },
			{ text: "Then.", startMs: 1000, endMs: 1240, leadingSpace: true },
		]);
	});
	it("joins contractions/subwords and repairs only the zero-length spoken word", () => {
		const words = parseWhisperJsonWords([
			token(" we", 6550, 6630),
			token("'ve", 6680, 6830),
			token(" got", 7060, 7060),
			token(" room", 7130, 7310),
			token(" check", 7690, 8000),
			token("points", 8010, 8390),
		]);
		expect(words.map(({ text, startMs, endMs }) => ({ text, startMs, endMs }))).toEqual([
			{ text: "we've", startMs: 6550, endMs: 6830 },
			{ text: "got", startMs: 7060, endMs: 7130 },
			{ text: "room", startMs: 7130, endMs: 7310 },
			{ text: "checkpoints", startMs: 7690, endMs: 8390 },
		]);
	});
	it("retains the transcript as a fallback when speech timestamps truly are unavailable", () => {
		const [cue] = parseWhisperJsonCues(
			JSON.stringify({
				transcription: [
					{
						text: "Hello there",
						offsets: { from: 0, to: 1000 },
						tokens: [{ text: " Hello" }, { text: " there" }],
					},
				],
			}),
		);
		expect(cue.text).toBe("Hello there");
		expect(cue.words).toBeUndefined();
	});
});
