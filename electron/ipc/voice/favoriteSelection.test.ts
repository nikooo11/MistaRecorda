import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { defaultVoiceSettings } from "../../../src/types/voice";
import type { VoicePreset } from "../../../src/types/voicePreset";
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
test("favoriting an imported team preset selects its shared settings, without a conversion action", async () => {
	const { settings, presets } = await stores();
	const preset: VoicePreset = {
		schema: "mistarecorda.voice-preset",
		version: 1,
		id: crypto.randomUUID(),
		name: "Team narrator",
		createdBy: "",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		voice: {
			voiceId: "team-voice",
			source: "owned",
			publicOwnerId: null,
			originalName: "Narrator",
			category: "cloned",
		},
		settings: {
			modelId: "eleven_english_sts_v2",
			stability: 0.3,
			similarityBoost: 0.8,
			style: 0.4,
			useSpeakerBoost: true,
			removeBackgroundNoise: true,
			postFx: { loudnessLufs: -18, eqPreset: "warm", pitchSemitones: 1 },
		},
		preview: { format: "wav", base64: "", text: "" },
		tags: [],
		isFavorite: true,
	};
	await presets.import(preset);
	await presets.favorite("other-favorite", true);
	await presets.favorite(preset.voice.voiceId, true);
	await selectSingleFavorite(settings, presets, {
		voiceId: preset.voice.voiceId,
		name: preset.name,
	});
	expect(await settings.read()).toMatchObject({
		...preset.settings,
		voiceId: "team-voice",
		voiceName: "Team narrator",
	});
	// On subsequent startup, a user's tuning is retained instead of reset to the preset.
	await settings.save({ ...(await settings.read()), stability: 0.6 });
	await presets.favorite("other-favorite", false);
	await selectSingleFavorite(settings, presets);
	expect((await settings.read()).stability).toBe(0.6);
});
