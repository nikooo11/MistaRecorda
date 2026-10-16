import fs from "node:fs/promises";
import { parseEnv } from "node:util";

/** The selected secret stays in the main process and goes straight to secure storage. */
export async function readOpenAIEnvFile(file: string): Promise<string> {
	try {
		const stat = await fs.stat(file);
		if (!stat.isFile() || stat.size > 65536) throw Error();
		const value = parseEnv(await fs.readFile(file, "utf8")).OPENAI_API_KEY?.trim();
		if (!value || value.length > 4096 || !/^sk-[\w-]+$/.test(value)) throw Error();
		return value;
	} catch {
		throw Error(
			"Choose an env file containing a valid OPENAI_API_KEY. Files must be under 64 KB.",
		);
	}
}
