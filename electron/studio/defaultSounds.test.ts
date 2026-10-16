import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { defaultSounds, seedDefaultSounds } from "./defaultSounds";
import { studioSettingsSchema } from "./model";

const assets = path.resolve("public/sounds/starter-v1");
const fresh = () => studioSettingsSchema.parse({ glow: true, windows: [], sounds: [] });
let storage: string;
beforeEach(async () => {
	storage = await fs.mkdtemp(path.join(os.tmpdir(), "default-sounds-"));
});
afterEach(async () => {
	await fs.rm(storage, { recursive: true, force: true });
});

test("all 22 bundled sounds are intact, audible stereo 48 kHz WAV files with exact durations", async () => {
	expect(defaultSounds).toHaveLength(22);
	expect(new Set(defaultSounds.map((s) => s.id)).size).toBe(22);
	for (const sound of defaultSounds) {
		const bytes = await fs.readFile(path.join(assets, sound.asset));
		expect(createHash("sha256").update(bytes).digest("hex")).toBe(sound.sha256);
		expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
		expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
		let pcm: Buffer | undefined;
		for (let offset = 12; offset + 8 <= bytes.length; ) {
			const size = bytes.readUInt32LE(offset + 4);
			const kind = bytes.toString("ascii", offset, offset + 4);
			if (kind === "fmt ") {
				expect(bytes.readUInt16LE(offset + 8)).toBe(1);
				expect(bytes.readUInt16LE(offset + 10)).toBe(2);
				expect(bytes.readUInt32LE(offset + 12)).toBe(48000);
				expect(bytes.readUInt16LE(offset + 22)).toBe(16);
			}
			if (kind === "data") pcm = bytes.subarray(offset + 8, offset + 8 + size);
			offset += 8 + size + (size % 2);
		}
		expect(pcm).toBeDefined();
		expect(Math.abs(pcm!.length / 192 - sound.durationMs)).toBeLessThan(1);
		let peak = 0;
		for (let i = 0; i < pcm!.length; i += 2)
			peak = Math.max(peak, Math.abs(pcm!.readInt16LE(i)));
		expect(peak).toBeGreaterThan(300);
		expect(Math.abs(pcm!.readInt16LE(0))).toBeLessThan(10);
		expect(Math.abs(pcm!.readInt16LE(pcm!.length - 2))).toBeLessThan(10);
	}
});

test("fresh install seeds 22 playable defaults, then does nothing on restart", async () => {
	const initial = fresh();
	const seeded = await seedDefaultSounds(initial, storage, assets);
	expect(initial.sounds).toHaveLength(0);
	expect(seeded.sounds).toHaveLength(22);
	expect(studioSettingsSchema.parse(seeded)).toEqual(seeded);
	for (const sound of seeded.sounds) {
		expect((await fs.stat(path.join(storage, sound.file))).size).toBeGreaterThan(1000);
		expect(sound.shortcut).toBe("");
	}
	expect(await seedDefaultSounds(seeded, storage, assets)).toBe(seeded);
});

test("upgrade preserves custom sounds, shortcuts, colors, names, favorites and audio settings", async () => {
	const settings = fresh();
	settings.glow = false;
	settings.includeSoundboardInRecording = false;
	settings.sounds = [
		{
			id: randomUUID(),
			file: `${randomUUID()}.wav`,
			name: "My sound",
			durationMs: 1200,
			volume: 0.4,
			shortcut: "Alt+1",
			favorite: true,
			color: "#123456",
		},
	];
	const seeded = await seedDefaultSounds(settings, storage, assets);
	expect(seeded.sounds).toHaveLength(23);
	expect(seeded.sounds[0]).toEqual(settings.sounds[0]);
	expect(seeded.glow).toBe(false);
	expect(seeded.includeSoundboardInRecording).toBe(false);
});

test("deleted defaults stay deleted; explicit restore brings them back without resetting retained sounds", async () => {
	const seeded = await seedDefaultSounds(fresh(), storage, assets);
	seeded.sounds[0] = {
		...seeded.sounds[0],
		name: "My reaction",
		volume: 0.3,
		favorite: true,
		color: "#112233",
		shortcut: "Alt+3",
	};
	const kept = seeded.sounds[0];
	seeded.sounds.pop();
	const reloaded = studioSettingsSchema.parse(JSON.parse(JSON.stringify(seeded)));
	expect(await seedDefaultSounds(reloaded, storage, assets)).toBe(reloaded);
	const restored = await seedDefaultSounds(reloaded, storage, assets, true);
	expect(restored.sounds).toHaveLength(22);
	expect(restored.sounds[0]).toEqual(kept);
	expect(restored.sounds.at(-1)?.name).toBe("Airhorn");
	expect(await seedDefaultSounds(restored, storage, assets, true)).toBe(restored);
});

test("partial pack upgrades only add unseen defaults", async () => {
	const seeded = await seedDefaultSounds(fresh(), storage, assets);
	const older = {
		...seeded,
		sounds: seeded.sounds.slice(0, 3),
		installedDefaultSoundIds: defaultSounds.slice(0, 4).map((s) => s.id),
	};
	const upgraded = await seedDefaultSounds(older, storage, assets);
	expect(upgraded.sounds.map((s) => s.name)).toEqual([
		"Fahhhhh",
		"Core",
		"Shocked",
		"Boom Timer",
		"Bow and Arrow",
		"Gear",
		"Slow Clap",
		"Who Are You",
		"Chill Guy",
		"Moo Deng Tantrum",
		"MJ Laugh",
		"Scrib Doon",
		"Dun Dun",
		"Emotional Damage",
		"Bruh",
		"Oh My God Wow",
		"Crickets",
		"Nani",
		"Think Music",
		"Boo-Womp",
		"Airhorn",
	]);
});

test("respects soundboard capacity and does not mark skipped defaults as installed", async () => {
	const full = fresh();
	full.sounds = Array.from({ length: 199 }, (_, n) => ({
		id: randomUUID(),
		file: `${randomUUID()}.wav`,
		name: `Custom ${n}`,
		durationMs: 500,
		volume: 1,
		shortcut: "",
		favorite: false,
		color: "#466784",
	}));
	const seeded = await seedDefaultSounds(full, storage, assets);
	expect(seeded.sounds).toHaveLength(200);
	expect(seeded.installedDefaultSoundIds).toHaveLength(1);
	await expect(seedDefaultSounds(seeded, storage, assets, true)).rejects.toThrow("Make room");
});

test("bad assets leave settings and storage intact; existing different files are never overwritten", async () => {
	const initial = fresh();
	await expect(
		seedDefaultSounds(initial, storage, path.join(storage, "missing")),
	).rejects.toThrow();
	expect(initial.sounds).toHaveLength(0);
	expect(await fs.readdir(storage)).toEqual([]);
	const destination = path.join(storage, `${defaultSounds[0].id}.wav`);
	await fs.writeFile(destination, "user content");
	await expect(seedDefaultSounds(initial, storage, assets)).rejects.toThrow("kept unchanged");
	expect(await fs.readFile(destination, "utf8")).toBe("user content");
	expect(await fs.readdir(storage)).toEqual([path.basename(destination)]);
});
