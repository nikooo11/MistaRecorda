import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { defaultVoiceSettings } from "../../../src/types/voice";
import { selectSingleFavorite } from "./favoriteSelection";
import { PresetStore } from "./presets";
import { VoiceSettingsStore } from "./settings";
const dirs: string[] = [];
const storage = {
	isEncryptionAvailable: () => false,
	encryptString: () => Buffer.alloc(0),
	decryptString: () => "",
};
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});
async function stores() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "favorite-selection-"));
	dirs.push(dir);
	return {
		dir,
		settings: new VoiceSettingsStore(dir, storage, () => undefined),
		presets: new PresetStore(path.join(dir, "presets")),
	};
}
test("one favorite selects immediately and on restart while preserving model/effects", async () => {
	const { dir, settings, presets } = await stores();
	const original = {
		...defaultVoiceSettings,
		voiceId: "previous",
		voiceName: "Previous",
		style: 0.8,
		postFx: { loudnessLufs: -20, eqPreset: "warm" as const, pitchSemitones: 2 },
	};
	await settings.save(original);
	await presets.favorite("favorite", true);
	await selectSingleFavorite(settings, presets, { voiceId: "favorite", name: "Narrator" });
	expect(await settings.read()).toEqual({
		...original,
		voiceId: "favorite",
		voiceName: "Narrator",
	});
	// New store instances model startup; even another manual choice is replaced on restart.
	await settings.save(original);
	const restarted = new VoiceSettingsStore(dir, storage, () => undefined);
	await selectSingleFavorite(restarted, new PresetStore(path.join(dir, "presets")));
	expect((await restarted.read()).voiceId).toBe("favorite");
	expect((await restarted.read()).postFx).toEqual(original.postFx);
});
test("zero/multiple favorites retain the manual choice; removing one selects the remaining voice", async () => {
	const { settings, presets } = await stores();
	await settings.save({ ...defaultVoiceSettings, voiceId: "manual", voiceName: "Manual" });
	await selectSingleFavorite(settings, presets);
	expect((await settings.read()).voiceId).toBe("manual");
	await presets.favorite("a", true);
	await presets.favorite("b", true);
	await selectSingleFavorite(settings, presets);
	expect((await settings.read()).voiceId).toBe("manual");
	await presets.favorite("b", false);
	await selectSingleFavorite(settings, presets);
	expect((await settings.read()).voiceId).toBe("a");
});
test("legacy automatic-conversion settings are discarded", async () => {
	const { settings, dir } = await stores();
	await fs.writeFile(
		path.join(dir, "voice-settings.json"),
		JSON.stringify({ ...defaultVoiceSettings, enabled: true, voiceId: "saved" }),
	);
	expect((await settings.read()).voiceId).toBe("saved");
	expect(await settings.read()).not.toHaveProperty("enabled");
});
