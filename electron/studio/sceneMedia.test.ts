import { afterEach, expect, test, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const host = vi.hoisted(() => ({ root: "" }));
vi.mock("electron", () => ({ app: { getPath: () => host.root }, dialog: {}, nativeImage: {} }));
vi.mock("../ipc/ffmpeg/binary", () => ({
	getFfmpegBinaryPath: () => path.join(process.cwd(), "node_modules/ffmpeg-static/ffmpeg"),
	getFfprobeBinaryPath: () =>
		path.join(
			process.cwd(),
			`node_modules/ffprobe-static/bin/${process.platform}/${process.arch}/ffprobe`,
		),
}));
import { SceneMediaTake, sceneMediaPath } from "./sceneMedia";
import { sceneMediaSchema } from "./model";
import { ffmpeg, audioDuration } from "../ipc/voice/chunker";
const source = sceneMediaSchema.parse({
	id: "07a3895e-594f-4fb5-bcc8-28c535dcd400",
	file: "07a3895e-594f-4fb5-bcc8-28c535dcd400.m4a",
	name: "Music",
	kind: "audio",
	enabled: true,
	x: 0,
	y: 0,
	width: 0.5,
	height: 0.5,
	volume: 0.2,
	opacity: 1,
	loop: true,
	hasAudio: true,
	durationMs: 500,
});
afterEach(async () => {
	if (host.root) await fs.rm(host.root, { recursive: true, force: true });
});
test("scene audio follows source intervals, stops on scene changes and loops to recorder duration", async () => {
	host.root = await fs.mkdtemp(path.join(os.tmpdir(), "scene-media-"));
	await fs.mkdir(path.join(host.root, "studio/media"), { recursive: true });
	await ffmpeg([
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=440:duration=0.5",
		"-c:a",
		"aac",
		path.join(host.root, "studio/media", source.file),
	]);
	const take = new SceneMediaTake();
	take.start([source, { ...source, id: crypto.randomUUID(), enabled: false }]);
	take.switch([{ ...source, loop: false }], 1200);
	take.switch([], 2400);
	expect(take.segments.map((s) => [s.startMs, s.endMs])).toEqual([
		[0, 1200],
		[1200, 1700],
	]);
	const regions = await take.renderAudio(path.join(host.root, "recording.mp4"));
	expect(regions).toHaveLength(2);
	expect(await audioDuration(regions[0].audioPath)).toBeCloseTo(1.2, 2);
	expect(await audioDuration(regions[1].audioPath)).toBeCloseTo(0.5, 2);
	expect(regions[1]).toMatchObject({ startMs: 1200, endMs: 1700, volume: 0.2 });
	const { stderr } = await promisify(execFile)(
		path.join(process.cwd(), "node_modules/ffmpeg-static/ffmpeg"),
		["-hide_banner", "-i", regions[0].audioPath, "-af", "volumedetect", "-f", "null", "-"],
	);
	expect(stderr).not.toContain("max_volume: -inf");
});
test("rejects paths outside managed scene storage and symlink media", async () => {
	expect(() => sceneMediaSchema.parse({ ...source, file: "../private.mp4" })).toThrow();
	host.root = await fs.mkdtemp(path.join(os.tmpdir(), "scene-media-path-"));
	await fs.mkdir(path.join(host.root, "studio/media"), { recursive: true });
	await fs.writeFile(path.join(host.root, "private"), "private");
	await fs.symlink(
		path.join(host.root, "private"),
		path.join(host.root, "studio/media", source.file),
	);
	await expect(sceneMediaPath(source)).rejects.toThrow("Import Music again");
});
