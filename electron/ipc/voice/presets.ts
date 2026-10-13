import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { migratePreset, type VoicePreset, type PresetEntry } from "../../../src/types/voicePreset";
import type { ElevenLabs } from "./elevenlabs";
const MAX_FILE = 12 * 1024 * 1024;
export function encodePreset(value: unknown) {
	return JSON.stringify(migratePreset(value), null, 2);
}
export function decodePreset(value: string) {
	if (Buffer.byteLength(value) > MAX_FILE) throw new Error("presetTooLarge");
	try {
		return migratePreset(JSON.parse(value));
	} catch (e) {
		if (e instanceof Error && ["futurePresetVersion", "invalidPreset"].includes(e.message))
			throw e;
		throw new Error("invalidPreset");
	}
}
export function packPresets(presets: VoicePreset[], samples: Record<string, Uint8Array> = {}) {
	const files: Record<string, Uint8Array> = {};
	for (const p of presets) files[`${p.id}.mpvoice`] = strToU8(encodePreset(p));
	for (const [name, bytes] of Object.entries(samples)) {
		if (!/^[a-zA-Z0-9._-]+$/.test(name) || bytes.length > 25 * 1024 * 1024)
			throw new Error("invalidSamples");
		files[`samples/${name}`] = bytes;
	}
	return zipSync(files);
}
export function unpackPresets(bytes: Uint8Array) {
	if (bytes.length > 100 * 1024 * 1024) throw new Error("presetTooLarge");
	let total = 0;
	let entries = 0;
	const files = unzipSync(bytes, {
		filter: (file) => {
			if (++entries > 200) throw new Error("presetTooLarge");
			if (!/^[a-zA-Z0-9-]+\.mpvoice$/.test(file.name)) return false;
			total += file.originalSize;
			if (file.originalSize > MAX_FILE || total > 100 * 1024 * 1024)
				throw new Error("presetTooLarge");
			return true;
		},
	});
	const presets = Object.values(files).map((bytes) => decodePreset(strFromU8(bytes)));
	if (!presets.length) throw new Error("invalidPreset");
	return presets;
}
const writes = new Map<string, Promise<unknown>>();
async function serialize<T>(key: string, action: () => Promise<T>): Promise<T> {
	const previous = writes.get(key) ?? Promise.resolve();
	const next = previous.catch(() => undefined).then(action);
	writes.set(key, next);
	try {
		return await next;
	} finally {
		if (writes.get(key) === next) writes.delete(key);
	}
}
export class PresetStore {
	constructor(readonly root: string) {}
	private file(id: string, folder = this.root) {
		if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalidPreset");
		return path.join(folder, `${id}.mpvoice.json`);
	}
	async list(folder = this.root): Promise<VoicePreset[]> {
		const names = await fs.readdir(folder).catch(() => []);
		const result: VoicePreset[] = [];
		for (const name of names.filter((n) => n.endsWith(".mpvoice.json"))) {
			try {
				const file = path.join(folder, name);
				if (
					(await fs.lstat(file)).isSymbolicLink() ||
					(await fs.stat(file)).size > MAX_FILE
				)
					continue;
				result.push(decodePreset(await fs.readFile(file, "utf8")));
			} catch {
				/* Ignore malformed synced files without executing or importing them. */
			}
		}
		return result.sort(
			(a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name),
		);
	}
	async get(id: string, folder = this.root) {
		try {
			return decodePreset(await fs.readFile(this.file(id, folder), "utf8"));
		} catch {
			return null;
		}
	}
	async save(value: unknown, folder = this.root) {
		const p = migratePreset(value);
		return serialize(this.file(p.id, folder), () => this.saveNow(p, folder));
	}
	private async saveNow(value: unknown, folder: string) {
		const p = migratePreset(value);
		await fs.mkdir(folder, { recursive: true });
		const target = this.file(p.id, folder);
		const current = await this.get(p.id, folder);
		if (current && Date.parse(current.updatedAt) > Date.parse(p.updatedAt)) return current;
		if (current && encodePreset(current) === encodePreset(p)) return current;
		if (current) await fs.copyFile(target, `${target}.bak`);
		const tmp = `${target}.${crypto.randomUUID()}.tmp`;
		try {
			await fs.writeFile(tmp, encodePreset(p), { mode: 0o600 });
			await fs.rename(tmp, target);
		} finally {
			await fs.rm(tmp, { force: true });
		}
		return p;
	}
	async remove(id: string) {
		await fs.rm(this.file(id), { force: true });
		return true;
	}
	async entries(teamFolder: string): Promise<PresetEntry[]> {
		return [
			...(await this.list()).map((preset) => ({ preset, location: "mine" as const })),
			...(teamFolder ? await this.list(teamFolder) : []).map((preset) => ({
				preset,
				location: "team" as const,
			})),
		];
	}
	async mergeTeam(folder: string) {
		for (const remote of await this.list(folder)) {
			const local = await this.get(remote.id);
			if (!local) continue;
			const winner =
				Date.parse(remote.updatedAt) > Date.parse(local.updatedAt) ? remote : local;
			await this.save(winner);
			await this.save(winner, folder);
		}
	}
	async import(value: unknown, rename?: string) {
		let p = migratePreset(value);
		const all = await this.list();
		if (all.some((x) => x.name === (rename ?? p.name))) throw new Error("presetNameClash");
		if (all.some((x) => x.id === p.id)) p = { ...p, id: crypto.randomUUID() };
		if (rename) p = migratePreset({ ...p, name: rename });
		return this.save(p);
	}
	async favorites() {
		try {
			const x = JSON.parse(
				await fs.readFile(path.join(path.dirname(this.root), "favorites.json"), "utf8"),
			);
			return Array.isArray(x)
				? x.filter((v): v is string => typeof v === "string" && v.length < 256)
				: [];
		} catch {
			return [];
		}
	}
	async favorite(id: string, enabled: boolean) {
		return serialize(path.join(path.dirname(this.root), "favorites.json"), () =>
			this.favoriteNow(id, enabled),
		);
	}
	private async favoriteNow(id: string, enabled: boolean) {
		if (typeof id !== "string" || id.length > 256 || typeof enabled !== "boolean")
			throw new Error("invalidSettings");
		const ids = new Set(await this.favorites());
		if (enabled) ids.add(id);
		else ids.delete(id);
		await fs.mkdir(path.dirname(this.root), { recursive: true });
		const target = path.join(path.dirname(this.root), "favorites.json");
		await fs.writeFile(`${target}.tmp`, JSON.stringify([...ids]), { mode: 0o600 });
		await fs.rename(`${target}.tmp`, target);
		return [...ids];
	}
}
export async function resolvePresetAccess(
	preset: VoicePreset,
	api: Pick<ElevenLabs, "getVoice" | "addLibraryVoice">,
): Promise<"ready" | "askShare"> {
	try {
		await api.getVoice(preset.voice.voiceId);
		return "ready";
	} catch (e) {
		if (!(e instanceof Error) || !["noAccess"].includes(e.message)) throw e;
	}
	if (preset.voice.source === "library" && preset.voice.publicOwnerId) {
		await api.addLibraryVoice(
			preset.voice.publicOwnerId,
			preset.voice.voiceId,
			preset.voice.originalName,
		);
		await api.getVoice(preset.voice.voiceId);
		return "ready";
	}
	return "askShare";
}
