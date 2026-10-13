import fs from "node:fs/promises";
import path from "node:path";
import { defaultVoiceSettings, type VoiceSettings } from "../../../src/types/voice";
export interface SecretStorage {
	isEncryptionAvailable(): boolean;
	encryptString(value: string): Buffer;
	decryptString(value: Buffer): string;
	getSelectedStorageBackend?: () => string;
}
export function validateSettings(value: unknown): VoiceSettings {
	if (!value || typeof value !== "object") throw new Error("invalidSettings");
	const x = value as Record<string, unknown>;
	const result = { ...defaultVoiceSettings };
	for (const key of [
		"enabled",
		"noticeAccepted",
		"useSpeakerBoost",
		"removeBackgroundNoise",
	] as const) {
		if (typeof x[key] !== "boolean") throw new Error("invalidSettings");
		result[key] = x[key];
	}
	for (const key of ["voiceId", "voiceName", "teamFolder"] as const) {
		if (typeof x[key] !== "string" || x[key].length > 4096) throw new Error("invalidSettings");
		result[key] = x[key];
	}
	if (!["eleven_multilingual_sts_v2", "eleven_english_sts_v2"].includes(String(x.modelId)))
		throw new Error("invalidSettings");
	result.modelId = x.modelId as VoiceSettings["modelId"];
	if (!["pcm_44100", "mp3_44100_192"].includes(String(x.outputFormat)))
		throw new Error("invalidSettings");
	result.outputFormat = x.outputFormat as VoiceSettings["outputFormat"];
	for (const key of ["stability", "similarityBoost", "style"] as const) {
		const n = x[key];
		if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1)
			throw new Error("invalidSettings");
		result[key] = n;
	}
	const p = x.postFx as VoiceSettings["postFx"];
	if (
		!p ||
		!Number.isFinite(p.loudnessLufs) ||
		p.loudnessLufs < -30 ||
		p.loudnessLufs > -10 ||
		!Number.isFinite(p.pitchSemitones) ||
		Math.abs(p.pitchSemitones) > 12 ||
		!["none", "warm", "bright"].includes(p.eqPreset)
	)
		throw new Error("invalidSettings");
	result.postFx = {
		loudnessLufs: p.loudnessLufs,
		eqPreset: p.eqPreset,
		pitchSemitones: p.pitchSemitones,
	};
	return result;
}
export class VoiceSettingsStore {
	constructor(
		private dir: string,
		private storage: SecretStorage,
		private environmentKey: () => string | undefined = () => process.env.ELEVENLABS_API_KEY,
	) {}
	async read(): Promise<VoiceSettings> {
		try {
			return validateSettings(
				JSON.parse(await fs.readFile(path.join(this.dir, "voice-settings.json"), "utf8")),
			);
		} catch {
			return structuredClone(defaultVoiceSettings);
		}
	}
	async save(value: unknown) {
		const settings = validateSettings(value);
		await this.write("voice-settings.json", Buffer.from(JSON.stringify(settings, null, 2)));
		return this.publicSettings();
	}
	private async write(name: string, data: Buffer) {
		await fs.mkdir(this.dir, { recursive: true });
		const target = path.join(this.dir, name);
		const temp = `${target}.${crypto.randomUUID()}.tmp`;
		try {
			await fs.writeFile(temp, data, { mode: 0o600 });
			await fs.rename(temp, target);
		} finally {
			await fs.rm(temp, { force: true });
		}
	}
	async key() {
		const injected = this.environmentKey();
		if (injected) return injected;
		if (
			!this.storage.isEncryptionAvailable() ||
			this.storage.getSelectedStorageBackend?.() === "basic_text"
		)
			return undefined;
		try {
			return this.storage.decryptString(
				await fs.readFile(path.join(this.dir, "voice-key.enc")),
			);
		} catch {
			return undefined;
		}
	}
	async setKey(key: unknown) {
		if (typeof key !== "string" || key.length > 4096) throw new Error("invalidKey");
		if (!key.trim()) {
			await fs.rm(path.join(this.dir, "voice-key.enc"), { force: true });
			return { hasKey: Boolean(await this.key()) };
		}
		if (
			!this.storage.isEncryptionAvailable() ||
			this.storage.getSelectedStorageBackend?.() === "basic_text"
		)
			throw new Error("secureStorageUnavailable");
		await this.write("voice-key.enc", this.storage.encryptString(key.trim()));
		return { hasKey: true };
	}
	async publicSettings() {
		return { ...(await this.read()), hasKey: Boolean(await this.key()) };
	}
}
