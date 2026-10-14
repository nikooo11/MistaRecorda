import { test, expect, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FigureSettings } from "./settings";
const dirs: string[] = [];
afterEach(async () => {
	for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});
async function setup(secure = true) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "figure-settings-"));
	dirs.push(root);
	const storage = {
		isEncryptionAvailable: () => secure,
		getSelectedStorageBackend: () => (secure ? "keychain" : "basic_text"),
		encryptString: vi.fn((s: string) => Buffer.from(s).reverse()),
		decryptString: vi.fn((b: Buffer) => Buffer.from(b).reverse().toString()),
	};
	return { root, storage, settings: new FigureSettings(root, storage) };
}
test("stores only encrypted bytes and status never decrypts", async () => {
	const { root, storage, settings } = await setup();
	await settings.setKey("sk-unit-test");
	expect(await fs.readFile(path.join(root, "openai-key.enc"), "utf8")).not.toContain(
		"sk-unit-test",
	);
	expect(await settings.hasKey()).toBe(true);
	expect(storage.decryptString).not.toHaveBeenCalled();
	expect(await settings.key()).toBe("sk-unit-test");
	await settings.setKey("");
	expect(await settings.hasKey()).toBe(false);
});
test("rejects plaintext fallbacks and invalid keys", async () => {
	const { settings } = await setup(false);
	await expect(settings.setKey("sk-unit-test")).rejects.toThrow("Secure");
	await expect(settings.setKey("not a key")).rejects.toThrow("OpenAI");
	expect(await settings.hasKey()).toBe(false);
});
