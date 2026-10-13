import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
vi.mock("../ffmpeg/binary", () => ({
	getFfmpegBinaryPath: () => "ffmpeg",
	getFfprobeBinaryPath: () => "ffprobe",
}));
import {
	audioMetadataPath,
	prepareRecordingAudio,
	readAudioMetadata,
	recordingBase,
	writeAudioMetadata,
} from "./library";
const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});
test("canonical naming retains dotted directories and names", () => {
	expect(recordingBase("/a.b/recording-1.mp4")).toBe("/a.b/recording-1");
});
test("metadata preserves measured mic delay and system source", async () => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voice-library-"));
	dirs.push(dir);
	const video = path.join(dir, "recording-1.mp4");
	const base = recordingBase(video);
	await fs.writeFile(`${base}.mic.wav`, "audio");
	await fs.writeFile(`${base}.system.m4a`, "system");
	const data = await prepareRecordingAudio(video, 123.4);
	expect(data.micOffsetMs).toBe(123);
	expect(data.micPath).toBe(`${base}.mic.wav`);
	expect(await readAudioMetadata(video)).toEqual(data);
	await writeAudioMetadata({
		...data,
		micSelection: "changed",
		changedMicPath: `${base}.voice-mic.wav`,
	});
	expect((await readAudioMetadata(video))?.micSelection).toBe("changed");
	await fs.writeFile(
		audioMetadataPath(video),
		JSON.stringify({ ...data, micPath: "/private/system.wav" }),
	);
	expect(await readAudioMetadata(video)).toBeNull();
});
