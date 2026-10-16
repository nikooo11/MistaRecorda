import { expect, test } from "vitest";
import { draftRect, dragObject, scenePoint } from "./objectPlacement";
import { mergeMemeLibraries } from "./memePreferences";
import { DEFAULT_MEME_PLAYBACK } from "../../types/memes";

for (const zoom of [0.25, 0.59, 1, 1.83, 2.56, 5])
	test(`placement remains under the pointer at zoom ${zoom}`, () => {
		const view = { offsetLeft: 77, offsetTop: 113, scrollX: -340, scrollY: 82, zoom };
		const rect = draftRect(730, 420, 2, view);
		expect(rect.width * zoom).toBeCloseTo(240);
		expect((rect.x + rect.width / 2 + view.scrollX) * zoom + view.offsetLeft).toBeCloseTo(730);
		expect((rect.y + rect.height / 2 + view.scrollY) * zoom + view.offsetTop).toBeCloseTo(420);
		const moved = dragObject(rect, 112, -48, zoom);
		expect((moved.x - rect.x) * zoom).toBeCloseTo(112);
		expect((moved.y - rect.y) * zoom).toBeCloseTo(-48);
		expect(moved.width).toBe(rect.width);
	});
for (const corner of ["nw", "ne", "sw", "se"])
	test(`resize ${corner} fixes the opposite corner and keeps aspect`, () => {
		const rect = { x: 80, y: 100, width: 200, height: 100 };
		const result = dragObject(rect, 80, 40, 2, corner);
		expect(result.width / result.height).toBeCloseTo(2);
		expect(corner.includes("w") ? result.x + result.width : result.x).toBe(
			corner.includes("w") ? 280 : 80,
		);
		expect(corner.includes("n") ? result.y + result.height : result.y).toBe(
			corner.includes("n") ? 200 : 100,
		);
		expect(result.width).toBeGreaterThan(0);
	});
test("fresh canvas origin overrides a moved window without affecting scene coordinates", () => {
	expect(
		scenePoint(400, 300, {
			offsetLeft: 100,
			offsetTop: 50,
			scrollX: 10,
			scrollY: -20,
			zoom: 2,
		}),
	).toEqual({ x: 140, y: 145 });
});
test("loading an old project preserves shared sound and effect preferences", () => {
	const a = {
		id: "id",
		name: "Reaction",
		dataURL: "image",
		width: 100,
		height: 100,
		...DEFAULT_MEME_PLAYBACK,
		soundId: "saved",
		shake: { target: "screen" as const, strength: 9, durationMs: 700 },
		loved: true,
	};
	const result = mergeMemeLibraries(
		[a],
		[{ ...a, soundId: "old", shake: undefined, loved: false }],
	);
	expect(result).toEqual([a]);
});
