import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test, vi } from "vitest";

const exec = promisify(execFile);
const ffmpeg = path.join(process.cwd(), "node_modules/ffmpeg-static/ffmpeg");
const ffprobe = path.join(
	process.cwd(),
	`node_modules/ffprobe-static/bin/${process.platform}/${process.arch}/ffprobe`,
);
vi.mock("electron", () => ({
	app: { getPath: () => os.tmpdir(), getAppPath: () => process.cwd(), isPackaged: false },
}));
vi.mock("../ffmpeg/binary", () => ({
	getFfmpegBinaryPath: () => ffmpeg,
	getFfprobeBinaryPath: () => ffprobe,
}));

import {
	appendRecordingClip,
	deleteRecordingArtifacts,
	joinCursorTelemetry,
	shiftRegions,
} from "./appendClip";
import { readAudioMetadata, writeAudioMetadata } from "./library";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});
async function tmp() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "append-clip-"));
	dirs.push(dir);
	return dir;
}
async function make(file: string, seconds: number, size = "320x240", audio = true) {
	await exec(ffmpeg, [
		"-y",
		"-loglevel",
		"error",
		"-f",
		"lavfi",
		"-i",
		`testsrc=size=${size}:rate=30:duration=${seconds}`,
		...(audio ? ["-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`] : []),
		"-c:v",
		"libx264",
		"-preset",
		"ultrafast",
		"-pix_fmt",
		"yuv420p",
		...(audio ? ["-c:a", "aac", "-ar", "48000", "-ac", "2"] : []),
		file,
	]);
}
async function tone(file: string, seconds: number) {
	await exec(ffmpeg, [
		"-y",
		"-loglevel",
		"error",
		"-f",
		"lavfi",
		"-i",
		`sine=frequency=220:duration=${seconds}`,
		"-ar",
		"48000",
		"-ac",
		"1",
		file,
	]);
}
async function length(file: string) {
	const { stdout } = await exec(ffprobe, [
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"csv=p=0",
		file,
	]);
	return Number(stdout) * 1000;
}

test("shifts second-clip timing onto the joined timeline", () => {
	expect(
		joinCursorTelemetry(
			{ samples: [{ timeMs: 0 }, { timeMs: 900 }, { timeMs: 1200 }] },
			{ samples: [{ timeMs: 0 }, { timeMs: 50 }] },
			1000,
		)?.samples.map((s) => s.timeMs),
	).toEqual([0, 900, 1000, 1050]);
	expect(joinCursorTelemetry(null, null, 1000)).toBeNull();
	expect(shiftRegions([{ id: "z", startMs: 10, endMs: 20 }], 1000, "append-")).toEqual([
		{ id: "append-z", startMs: 1010, endMs: 1020 },
	]);
});

test("joins a new take and every sidecar after the first recording", async () => {
	const dir = await tmp();
	const first = path.join(dir, "recording-1.mp4");
	const second = path.join(dir, "recording-2.mp4");
	await make(first, 1);
	await make(second, 1.5);
	await tone(path.join(dir, "recording-1.mic.wav"), 0.8);
	await writeAudioMetadata({
		version: 1,
		videoPath: first,
		micPath: path.join(dir, "recording-1.mic.wav"),
		systemAudioPath: null,
		micOffsetMs: 100,
	});
	await make(path.join(dir, "recording-2-webcam.mp4"), 1, "160x120", false);
	await fs.writeFile(
		`${first}.cursor.json`,
		JSON.stringify({ version: 2, samples: [{ timeMs: 0, cx: 0.1, cy: 0.1 }] }),
	);
	await fs.writeFile(
		`${second}.cursor.json`,
		JSON.stringify({ version: 2, samples: [{ timeMs: 40, cx: 0.5, cy: 0.5 }] }),
	);
	await fs.writeFile(
		`${second}.zooms.json`,
		JSON.stringify({ version: 1, regions: [{ id: "held-1", startMs: 100, endMs: 600 }] }),
	);
	await tone(`${second}.sound-0.wav`, 0.2);
	await fs.writeFile(
		`${second}.sounds.json`,
		JSON.stringify({
			version: 1,
			regions: [
				{
					id: "s1",
					startMs: 200,
					endMs: 400,
					volume: 1,
					audioPath: "recording-2.mp4.sound-0.wav",
				},
			],
		}),
	);

	const result = await appendRecordingClip(
		{ videoPath: first },
		{
			videoPath: second,
			webcamPath: path.join(dir, "recording-2-webcam.mp4"),
			timeOffsetMs: 200,
		},
		dir,
		99,
	);

	expect(result.videoPath).toBe(path.join(dir, "recording-99.mp4"));
	expect(result.firstDurationMs).toBeGreaterThan(950);
	expect(result.secondDurationMs).toBeGreaterThan(1450);
	const total = result.firstDurationMs + result.secondDurationMs;
	expect(Math.abs((await length(result.videoPath)) - total)).toBeLessThan(120);
	expect(Math.abs((await length(result.webcamPath!)) - total)).toBeLessThan(120);
	const audio = await readAudioMetadata(result.videoPath);
	expect(audio).toMatchObject({ micOffsetMs: 0, systemOffsetMs: 0, systemAudioPath: null });
	expect(Math.abs((await length(audio!.micPath!)) - total)).toBeLessThan(120);
	const cursor = JSON.parse(await fs.readFile(`${result.videoPath}.cursor.json`, "utf8"));
	expect(cursor.samples.map((s: { timeMs: number }) => s.timeMs)).toEqual([
		0,
		result.firstDurationMs + 40,
	]);
	const zooms = JSON.parse(await fs.readFile(`${result.videoPath}.zooms.json`, "utf8"));
	expect(zooms.regions).toEqual([
		{
			id: "append-held-1",
			startMs: result.firstDurationMs + 100,
			endMs: result.firstDurationMs + 600,
		},
	]);
	const sounds = JSON.parse(await fs.readFile(`${result.videoPath}.sounds.json`, "utf8"));
	expect(sounds.regions[0]).toMatchObject({
		startMs: result.firstDurationMs + 200,
		audioPath: "recording-99.mp4.sound-0.wav",
	});
	await fs.access(path.join(dir, "recording-99.mp4.sound-0.wav"));
	// Inputs are untouched so the take can be discarded back to the first recording.
	await fs.access(first);
	await fs.access(second);

	await deleteRecordingArtifacts(result.videoPath);
	const left = await fs.readdir(dir);
	expect(left.filter((n) => n.startsWith("recording-99."))).toEqual([]);
	expect(left).toContain("recording-99-webcam.mp4");
	expect(left).toContain("recording-1.mp4");
}, 60000);

test("re-encodes takes recorded at different sizes", async () => {
	const dir = await tmp();
	const first = path.join(dir, "recording-1.mp4");
	const second = path.join(dir, "recording-2.mp4");
	await make(first, 1, "320x240");
	await make(second, 1, "160x120", false);
	const result = await appendRecordingClip({ videoPath: first }, { videoPath: second }, dir, 7);
	const { stdout } = await exec(ffprobe, [
		"-v",
		"error",
		"-show_entries",
		"stream=codec_type,width,height",
		"-of",
		"json",
		result.videoPath,
	]);
	const streams = JSON.parse(stdout).streams;
	expect(streams.find((s: { codec_type: string }) => s.codec_type === "video")).toMatchObject({
		width: 320,
		height: 240,
	});
	expect(streams.some((s: { codec_type: string }) => s.codec_type === "audio")).toBe(true);
	expect(Math.abs((await length(result.videoPath)) - 2000)).toBeLessThan(150);
}, 60000);
