import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "vitest";
import { readOpenAIEnvFile } from "./importKey";

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
