import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, test, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { migratePreset, type VoicePreset } from "../../../src/types/voicePreset";
import {
	PresetStore,
	encodePreset,
	decodePreset,
	packPresets,
	unpackPresets,
	resolvePresetAccess,
} from "./presets";
const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});
async function makeStore() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "presets-test-"));
	dirs.push(dir);
	return new PresetStore(path.join(dir, "presets"));
}
function preset(): VoicePreset {
	return {
		schema: "mistarecorda.voice-preset",
		version: 1,
		id: crypto.randomUUID(),
		name: "Narrator",
		createdBy: "owner@example.test",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		voice: {
			voiceId: "voice-123",
			source: "owned",
			publicOwnerId: null,
			originalName: "Original",
			category: "cloned",
		},
		settings: {
			modelId: "eleven_english_sts_v2",
			stability: 0.12,
			similarityBoost: 0.91,
			style: 0.7,
			useSpeakerBoost: false,
			removeBackgroundNoise: false,
			postFx: { loudnessLufs: -18, eqPreset: "warm", pitchSemitones: -2.5 },
		},
		preview: { format: "wav", base64: "YWJj", text: "Preview" },
		tags: ["team"],
		isFavorite: true,
	};
}
test("single and pack round-trip preserve every field and edited setting", () => {
	const p = preset();
	expect(decodePreset(encodePreset(p))).toEqual(p);
	expect(unpackPresets(packPresets([p]))).toEqual([p]);
});
test("schema migrations accept v1, reject future versions and credential fields", () => {
	const p = preset();
	expect(migratePreset(p)).toEqual(p);
	expect(() => migratePreset({ ...p, version: 2 })).toThrow("futurePresetVersion");
	expect(() => migratePreset({ ...p, apiKey: "never-export-me" })).toThrow("invalidPreset");
	expect(() => migratePreset({ ...p, settings: { ...p.settings, apiKey: "secret" } })).toThrow(
		"invalidPreset",
	);
	expect(() => migratePreset({ ...p, settings: { ...p.settings, stability: 2 } })).toThrow(
		"invalidPreset",
	);
});
test("owned accessible import makes only a read request", async () => {
	const api = { getVoice: vi.fn().mockResolvedValue({}), addLibraryVoice: vi.fn() };
	expect(await resolvePresetAccess(preset(), api)).toBe("ready");
	expect(api.addLibraryVoice).not.toHaveBeenCalled();
});
test("library import auto-adds and rechecks access", async () => {
	const p = preset();
	p.voice.source = "library";
	p.voice.publicOwnerId = "public-owner";
	const api = {
		getVoice: vi.fn().mockRejectedValueOnce(new Error("noAccess")).mockResolvedValueOnce({}),
		addLibraryVoice: vi.fn().mockResolvedValue({}),
	};
	expect(await resolvePresetAccess(p, api)).toBe("ready");
	expect(api.addLibraryVoice).toHaveBeenCalledWith("public-owner", "voice-123", "Original");
	expect(api.getVoice).toHaveBeenCalledTimes(2);
});
test("workspace no access asks owner without uploading or cloning", async () => {
	const p = preset();
	p.voice.source = "workspace-shared";
	const api = {
		getVoice: vi.fn().mockRejectedValue(new Error("noAccess")),
		addLibraryVoice: vi.fn(),
	};
	expect(await resolvePresetAccess(p, api)).toBe("askShare");
	expect(api.addLibraryVoice).not.toHaveBeenCalled();
});
test("invalid key is not mistaken for missing voice access", async () => {
	const api = {
		getVoice: vi.fn().mockRejectedValue(new Error("invalidKey")),
		addLibraryVoice: vi.fn(),
	};
	await expect(resolvePresetAccess(preset(), api)).rejects.toThrow("invalidKey");
	expect(api.addLibraryVoice).not.toHaveBeenCalled();
});
test("newest team edit wins and keeps a backup", async () => {
	const store = await makeStore();
	const team = path.join(path.dirname(store.root), "team");
	const p = preset();
	await store.save(p);
	const newer = { ...p, name: "Team edit", updatedAt: "2026-02-01T00:00:00.000Z" };
	await store.save(newer, team);
	await store.mergeTeam(team);
	expect(await store.get(p.id)).toEqual(newer);
	expect(
		decodePreset(await fs.readFile(path.join(store.root, `${p.id}.mpvoice.json.bak`), "utf8")),
	).toEqual(p);
	await store.save(p);
	expect(await store.get(p.id)).toEqual(newer);
});
test("local newest edit is copied back to shared folder", async () => {
	const store = await makeStore();
	const p = preset();
	const team = path.join(path.dirname(store.root), "team");
	await store.save(p, team);
	const newer = { ...p, updatedAt: "2026-03-01T00:00:00.000Z", name: "Local edit" };
	await store.save(newer);
	await store.mergeTeam(team);
	expect(await store.get(p.id, team)).toEqual(newer);
});
test("import prompts for name clash and preserves settings and favorite on rename", async () => {
	const store = await makeStore();
	const p = preset();
	await store.import(p);
	await expect(store.import(p)).rejects.toThrow("presetNameClash");
	const copy = await store.import(p, "New name");
	expect(copy.id).not.toBe(p.id);
	expect(copy.settings).toEqual(p.settings);
	expect(copy.isFavorite).toBe(true);
	await store.favorite(p.voice.voiceId, true);
	expect(await store.favorites()).toEqual([p.voice.voiceId]);
});
test("pack ignores traversal entries and never extracts files", () => {
	const p = preset();
	const bytes = zipSync({
		[`${p.id}.mpvoice`]: strToU8(encodePreset(p)),
		"../../secret": strToU8("bad"),
	});
	expect(unpackPresets(bytes)).toEqual([p]);
});
test("malformed preview and unbounded effects are rejected", () => {
	const p = preset();
	expect(() =>
		migratePreset({ ...p, preview: { ...p.preview, base64: "javascript:bad" } }),
	).toThrow();
	expect(() =>
		migratePreset({
			...p,
			settings: { ...p.settings, postFx: { ...p.settings.postFx, pitchSemitones: 30 } },
		}),
	).toThrow();
});
test("a voice preset can be shared without disclosing an author name or email", async () => {
	const store = await makeStore();
	const p = { ...preset(), createdBy: "", preview: { format: "wav" as const, base64: "", text: "" } };
	await store.save(p);
	expect(migratePreset(JSON.parse(encodePreset(p)))).toEqual(p);
	expect(await store.get(p.id)).toEqual(p);
});
test("concurrent writes keep newest update and favorites are not lost", async () => {
	const store = await makeStore();
	const p = preset();
	await Promise.all([store.save({ ...p, updatedAt: "2026-03-01T00:00:00.000Z" }), store.save(p)]);
	expect((await store.get(p.id))?.updatedAt).toBe("2026-03-01T00:00:00.000Z");
	await Promise.all([store.favorite("a", true), store.favorite("b", true)]);
	expect(await store.favorites()).toEqual(["a", "b"]);
});

test("saved renamed presets retain their exact shared name in single and pack imports", async () => {
	const sender = await makeStore();
	const original = preset();
	await sender.save(original);
	const renamed = await sender.save({
		...original,
		name: "Mista — Narrator É",
		updatedAt: "2026-02-01T00:00:00.000Z",
	});
	const reopened = await sender.get(renamed.id);
	expect(reopened?.name).toBe("Mista — Narrator É");
	const singleRecipient = await makeStore();
	const packRecipient = await makeStore();
	const single = await singleRecipient.import(decodePreset(encodePreset(reopened)));
	const packed = await packRecipient.import(unpackPresets(packPresets([renamed]))[0]);
	for (const imported of [single, packed]) {
		expect(imported.name).toBe("Mista — Narrator É");
		expect(imported.voice).toEqual(original.voice);
		expect(imported.settings).toEqual(original.settings);
	}
});
