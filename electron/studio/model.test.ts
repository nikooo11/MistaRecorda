import { expect, test } from "vitest";
import { DEFAULT_CAMERA_LAYOUT } from "../../src/lib/cameraLayout";
import { SoundTake, shortcutSchema, soundSchema, studioSettingsSchema } from "./model";

test("existing settings gain a camera shortcut without changing user choices", () => {
	const result = studioSettingsSchema.parse({ glow: false, windows: [], sounds: [] });
	expect(result).toEqual({
		glow: false,
		includeSoundboardInRecording: true,
		windows: [],
		sounds: [],
		installedDefaultSoundIds: [],
		scenes: [],
		sourceAliases: [],
		cameraShortcut: "CommandOrControl+Shift+W",
		cameraLayout: DEFAULT_CAMERA_LAYOUT,
	});
});
test("sound cues use media time, ignore pause and suppress keyboard repeats", () => {
	const take = new SoundTake();
	expect(take.trigger("a", "/sound.wav", 2000, 0.7, 1000, false)).toBe(true);
	expect(take.trigger("a", "/sound.wav", 2000, 0.7, 1020, false)).toBe(false);
	expect(take.trigger("b", "/sound2.wav", 500, 1, 1020, false)).toBe(true);
	expect(take.trigger("a", "/sound.wav", 2000, 0.7, 1200, true)).toBe(false);
	expect(take.regions[0]).toMatchObject({
		startMs: 1000,
		endMs: 3000,
		volume: 0.7,
		normalize: false,
	});
});
test("shortcut and imported sound validation reject unsafe input", () => {
	expect(shortcutSchema.parse("CommandOrControl+Alt+1")).toBeTruthy();
	expect(shortcutSchema.safeParse("Z").success).toBe(true);
	expect(shortcutSchema.safeParse("Control+../foo").success).toBe(false);
	expect(
		soundSchema.safeParse({
			id: crypto.randomUUID(),
			name: "test",
			file: "../a.wav",
			durationMs: 100,
			volume: 1,
			shortcut: "",
		}).success,
	).toBe(false);
});
