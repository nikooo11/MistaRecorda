import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pack from "../../public/sounds/starter-v1/manifest.json";
import type { StudioSettings } from "../../src/types/studio";

export const defaultSounds = pack.sounds;
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");

/** Install once per sound. Removing a default is a user choice, not a missing migration. */
export async function seedDefaultSounds(
	settings: StudioSettings,
	storage: string,
	assets: string,
	restore = false,
): Promise<StudioSettings> {
	const installed = new Set(settings.installedDefaultSoundIds ?? []);
	const existing = new Set(settings.sounds.map((sound) => sound.id));
	const missing = defaultSounds.filter(
		(sound) => !existing.has(sound.id) && (restore || !installed.has(sound.id)),
	);
	const capacity = Math.max(0, 200 - settings.sounds.length);
	if (restore && missing.length > capacity)
		throw Error("Make room in your soundboard before restoring defaults (200 sounds maximum).");
	const additions = missing.slice(0, capacity);
	// Check every selected asset before changing the soundboard or copying any files.
	const data = await Promise.all(
		additions.map(async (sound) => {
			const bytes = await fs.readFile(path.join(assets, sound.asset));
			if (hash(bytes) !== sound.sha256)
				throw Error(`Default sound is damaged: ${sound.name}`);
			return bytes;
		}),
	);
	if (additions.length) await fs.mkdir(storage, { recursive: true });
	for (const [index, sound] of additions.entries()) {
		const destination = path.join(storage, `${sound.id}.wav`);
		const temporary = path.join(storage, `default-${randomUUID()}.tmp`);
		try {
			await fs.writeFile(temporary, data[index], { flag: "wx", mode: 0o600 });
			await fs.link(temporary, destination); // Publish only a complete file; never overwrite.
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			// A prior interrupted installation may have copied this file already.
			const stat = await fs.lstat(destination);
			if (!stat.isFile() || hash(await fs.readFile(destination)) !== sound.sha256)
				throw Error(
					`A different file already exists for ${sound.name}; it was kept unchanged.`,
				);
		} finally {
			await fs.rm(temporary, { force: true });
		}
		installed.add(sound.id);
	}
	for (const sound of defaultSounds) if (existing.has(sound.id)) installed.add(sound.id);
	if (!additions.length && installed.size === (settings.installedDefaultSoundIds ?? []).length)
		return settings;
	return {
		...settings,
		installedDefaultSoundIds: [...installed],
		sounds: [
			...settings.sounds,
			...additions.map((sound) => ({
				id: sound.id,
				name: sound.name,
				file: `${sound.id}.wav`,
				durationMs: sound.durationMs,
				color: sound.color,
				volume: 1,
				favorite: false,
				shortcut: "",
			})),
		],
	};
}
