import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { presenterURL } from "../../src/components/board/presenterModel";
/** OS URL dispatch uses the user's existing Chrome profile and opens a tab. */
export async function openChrome(value: string) {
	const url = presenterURL(value).href;
	try {
		if (process.platform === "darwin")
			await promisify(execFile)("open", ["-a", "Google Chrome", url]);
		else if (process.platform === "win32") {
			const candidates = [
				process.env.PROGRAMFILES,
				process.env["PROGRAMFILES(X86)"],
				process.env.LOCALAPPDATA,
			]
				.filter(Boolean)
				.map((root) => path.join(root!, "Google", "Chrome", "Application", "chrome.exe"));
			const executable = (
				await Promise.all(
					candidates.map(async (file) =>
						(await fs.stat(file).catch(() => null))?.isFile() ? file : null,
					),
				)
			).find(Boolean);
			if (!executable) throw Error("Chrome is not installed");
			await promisify(execFile)(executable, ["--new-tab", url]);
		} else await promisify(execFile)("google-chrome", ["--new-tab", url]);
	} catch {
		throw Error(
			"Could not open Google Chrome on the computer. Check that Chrome is installed.",
		);
	}
}
