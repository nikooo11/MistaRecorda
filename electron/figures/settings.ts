import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SecretStorage } from "../ipc/voice/settings";
export class FigureSettings {
	constructor(
		readonly root: string,
		private storage: SecretStorage,
	) {}
	private get file() {
		return path.join(this.root, "openai-key.enc");
	}
	async hasKey() {
		return !!(await fs.stat(this.file).catch(() => null))?.size;
	}
	async key() {
		const data = await fs.readFile(this.file).catch(() => null);
		if (!data) throw Error("Add your OpenAI API key in Capture settings → Setup on the Mac.");
		this.requireStorage();
		return this.storage.decryptString(data);
	}
	private requireStorage() {
		if (
			!this.storage.isEncryptionAvailable() ||
			this.storage.getSelectedStorageBackend?.() === "basic_text"
		)
			throw Error("Secure key storage is unavailable on this computer.");
	}
	async setKey(value: unknown) {
		if (typeof value !== "string" || value.length > 4096) throw Error("Invalid API key");
		if (!value.trim()) {
			await fs.rm(this.file, { force: true });
			return false;
		}
		if (!/^sk-[\w-]+$/.test(value.trim())) throw Error("Enter an OpenAI API key.");
		this.requireStorage();
		await fs.mkdir(this.root, { recursive: true });
		const tmp = `${this.file}.${randomUUID()}.tmp`;
		try {
			await fs.writeFile(tmp, this.storage.encryptString(value.trim()), { mode: 0o600 });
			await fs.rename(tmp, this.file);
		} finally {
			await fs.rm(tmp, { force: true });
		}
		return true;
	}
}
