import { expect, test } from "vitest";
import { studioSettingsSchema } from "./model";
import { migrateWindowShortcuts } from "./sceneMigration";
test("legacy window shortcuts migrate once to complete, editable scenes", () => {
	const settings = studioSettingsSchema.parse({
		glow: true,
		sounds: [],
		windows: [
			{
				slot: 1,
				shortcut: "F3",
				source: { id: "window:4:0", name: "Chrome", sourceType: "window" },
			},
		],
	});
	const next = migrateWindowShortcuts(settings);
	expect(next.windows).toEqual([]);
	expect(next.scenes[0]).toMatchObject({
		name: "Chrome",
		shortcut: "F3",
		camera: true,
		audio: { microphone: true, system: true },
	});
	expect(migrateWindowShortcuts(next)).toBe(next);
	expect(studioSettingsSchema.parse(next).showStudioInCapture).toBe(false);
});
