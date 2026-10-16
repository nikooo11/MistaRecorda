import { expect, test } from "vitest";
import { studioSettingsSchema } from "./model";
import { withStarterScene } from "./starterScene";

test("a fresh install gets a ready screen scene without replacing custom or deleted scenes", () => {
	const defaults = studioSettingsSchema.parse({ glow: true, windows: [], sounds: [] });
	const screen = {
		id: "screen:1:0",
		name: "Screen 1",
		display_id: "1",
		sourceType: "screen" as const,
	};
	const next = withStarterScene(defaults, screen);
	expect(next.scenes).toHaveLength(1);
	expect(next.scenes[0]).toMatchObject({
		source: screen,
		camera: true,
		audio: { microphone: true, system: true },
		media: [],
		shortcut: "",
	});
	expect(withStarterScene(next, screen)).toBe(next);
	const deleted = { ...next, scenes: [] };
	expect(withStarterScene(deleted, screen)).toBe(deleted);
	const existing = {
		...defaults,
		scenes: [{ ...next.scenes[0], name: "My tutorial", camera: false }],
	};
	expect(withStarterScene(existing, screen).scenes).toEqual(existing.scenes);
});
