import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ensureNativeWindowListBinary } from "../ipc/paths/binaries";

const exec = promisify(execFile);

/** Focus failure must never undo a confirmed recording-source switch. */
export async function focusRecordingWindow(sourceId: string): Promise<string> {
	if (process.platform !== "darwin") return "";
	const match = /^window:([1-9]\d*):\d+$/.exec(sourceId);
	const id = match ? Number(match[1]) : 0;
	if (!id || id > 0xffffffff) return "The window could not be brought to the front.";
	try {
		const helper = await ensureNativeWindowListBinary();
		const { stdout } = await exec(helper, ["--focus", String(id)], {
			timeout: 5000,
			maxBuffer: 4096,
		});
		if (stdout.trim() !== `WINDOW_FOCUSED ${id}`)
			throw Error("Window activation was not confirmed.");
		return "";
	} catch (error) {
		const stderr = (error as { stderr?: string }).stderr ?? "";
		if (stderr.includes("ACCESSIBILITY_PERMISSION_REQUIRED"))
			return "Allow MistaRecorda in System Settings → Privacy & Security → Accessibility to bring recorded windows to the front.";
		return "The recording source changed, but its window could not be brought to the front. Select it on the desktop and try its shortcut again.";
	}
}
