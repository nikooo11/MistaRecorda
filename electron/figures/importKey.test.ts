import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect, vi } from "vitest";
import { importOpenAIKey, readOpenAIEnvFile } from "./importKey";

test("native IPC actors can import while companions and agents cannot open the key picker", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "key-import-actor-"));
	const file = path.join(root, ".env.local");
	const select = vi.fn(async () => file);
	const save = vi.fn(async (_key: string) => ({ hasKey: true }));
	try {
		await fs.writeFile(file, "OPENAI_API_KEY=sk-test-only\n");
		for (const actor of ["desktop", "desktop:42"])
			expect(await importOpenAIKey(actor, select, save)).toEqual({ hasKey: true });
		expect(save).toHaveBeenCalledWith("sk-test-only");
		select.mockClear();
		save.mockClear();
		for (const actor of ["codex", "device:42", "desktop:forged", "desktop:42:remote"])
			await expect(importOpenAIKey(actor, select, save)).rejects.toThrow(
				"Import keys on the Mac",
			);
		expect(select).not.toHaveBeenCalled();
		expect(save).not.toHaveBeenCalled();
		expect(await importOpenAIKey("desktop:42", async () => undefined, save)).toBeNull();
		expect(save).not.toHaveBeenCalled();
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("env import handles quotes without executing values and errors never echo contents", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "key-import-test-"));
	const file = path.join(root, ".env.local");
	try {
		await fs.writeFile(file, '# Test only\nexport OPENAI_API_KEY="sk-test-only"\n');
		expect(await readOpenAIEnvFile(file)).toBe("sk-test-only");
		for (const content of [
			"OTHER=sk-private-fixture",
			"OPENAI_API_KEY=$(echo private-fixture)",
			"OPENAI_API_KEY=" + "x".repeat(65536),
		]) {
			await fs.writeFile(file, content);
			await expect(readOpenAIEnvFile(file)).rejects.toThrow(
				/^Choose an env file containing a valid OPENAI_API_KEY/,
			);
		}
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
