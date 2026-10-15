import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("electron", () => ({
	app: { getPath: () => os.tmpdir(), isPackaged: false },
	BrowserWindow: { getAllWindows: () => [] },
}));

import type { AudioRegion } from "../../src/components/video-editor/types";
import { isVoiceExportReady, recordingVoiceKey } from "../../src/lib/voiceExport";
import { defaultVoiceSettings } from "../../src/types/voice";
import { prepareRecordingAudio, readAudioMetadata } from "../ipc/recording/library";
import { audioDuration, ffmpeg } from "../ipc/voice/chunker";
import { ElevenLabs } from "../ipc/voice/elevenlabs";
import { convertCuedMicrophone } from "../ipc/voice/job";
import { bakeSounds } from "./bakeSounds";
import { validateVoiceCues } from "./validateVoiceCues";

const dirs: string[] = [];
async function temp() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "studio-audio-"));
	dirs.push(dir);
	return dir;
}
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});
async function pcm(file: string, dir: string) {
	const out = path.join(dir, `${crypto.randomUUID()}.pcm`);
	await ffmpeg(["-i", file, "-f", "s16le", "-ar", "48000", "-ac", "1", out]);
	return fs.readFile(out);
}
function rms(bytes: Buffer, start: number, end: number) {
	let sum = 0;
	let n = 0;
	for (
		let i = Math.round(start * 48000);
		i < Math.min(Math.round(end * 48000), bytes.length / 2);
		i++
	) {
		sum += (bytes.readInt16LE(i * 2) / 32768) ** 2;
		n++;
	}
	return Math.sqrt(sum / n);
}
function frequency(bytes: Buffer, start: number, end: number) {
	let crossings = 0;
	const a = Math.round(start * 48000),
		b = Math.min(Math.round(end * 48000), bytes.length / 2);
	for (let i = a + 1; i < b; i++)
		if (bytes.readInt16LE((i - 1) * 2) <= 0 && bytes.readInt16LE(i * 2) > 0) crossings++;
	return crossings / ((b - a) / 48000);
}
test("included sounds occur once at the trigger time, preserve isolated mic, and leave no duplicate editor cue", async () => {
	const dir = await temp(),
		base = path.join(dir, "take"),
		video = `${base}.mp4`,
		sound = path.join(dir, "sound.wav");
	await ffmpeg([
		"-f",
		"lavfi",
		"-i",
		"color=c=black:s=160x90:d=3:r=10",
		"-c:v",
		"libx264",
		video,
	]);
	await ffmpeg([
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=440:duration=3",
		"-ar",
		"48000",
		"-ac",
		"1",
		`${base}.mic.source.wav`,
	]);
	await ffmpeg([
		"-f",
		"lavfi",
		"-i",
		"anullsrc=r=48000:cl=stereo",
		"-t",
		"3",
		`${base}.system.wav`,
	]);
	await ffmpeg([
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=880:duration=0.5",
		"-ar",
		"48000",
		"-ac",
		"1",
		sound,
	]);
	const before = await prepareRecordingAudio(video);
	const original = await fs.readFile(before.micPath!);
	const regions = [
		{ id: "cue", startMs: 1000, endMs: 1500, audioPath: sound, volume: 1, normalize: false },
	] as AudioRegion[];
	await fs.writeFile(`${video}.sounds.json`, JSON.stringify({ version: 1, regions }));
	await bakeSounds(video, regions);
	const meta = await readAudioMetadata(video);
	expect(meta?.systemOffsetMs).toBe(0);
	expect(await fs.readFile(meta!.micPath!)).toEqual(original);
	const samples = await pcm(meta!.systemAudioPath!, dir);
	expect(rms(samples, 0.1, 0.8)).toBeLessThan(0.001);
	expect(rms(samples, 1.1, 1.4)).toBeGreaterThan(0.055);
	expect(rms(samples, 1.1, 1.4)).toBeLessThan(0.075);
	expect(rms(samples, 1.8, 2.8)).toBeLessThan(0.001);
	expect(JSON.parse(await fs.readFile(`${video}.sounds.json`, "utf8"))).toMatchObject({
		regions: [],
		includedInRecording: true,
	});
	expect(await audioDuration(video)).toBeCloseTo(3, 1);
}, 20000);
test("failed sound mixing leaves the original video and editor cues intact", async () => {
	const dir = await temp(),
		video = path.join(dir, "take.mp4");
	await ffmpeg([
		"-f",
		"lavfi",
		"-i",
		"color=c=black:s=160x90:d=1:r=10",
		"-c:v",
		"libx264",
		video,
	]);
	const original = await fs.readFile(video);
	const manifest = JSON.stringify({ version: 1, regions: [{ id: "retained" }] });
	await fs.writeFile(`${video}.sounds.json`, manifest);
	await expect(
		bakeSounds(video, [
			{ audioPath: path.join(dir, "missing.wav"), volume: 1, startMs: 0 } as AudioRegion,
		]),
	).rejects.toThrow();
	expect(await fs.readFile(video)).toEqual(original);
	expect(await fs.readFile(`${video}.sounds.json`, "utf8")).toBe(manifest);
}, 20000);
test("voice cues convert only assigned spans in order and retain original microphone and timing", async () => {
	const dir = await temp(),
		mic = path.join(dir, "original.wav"),
		raw = path.join(dir, "converted.pcm");
	await ffmpeg([
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=440:duration=3",
		"-ar",
		"48000",
		"-ac",
		"1",
		mic,
	]);
	await ffmpeg([
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=880:duration=1",
		"-ar",
		"44100",
		"-ac",
		"1",
		"-f",
		"s16le",
		raw,
	]);
	const original = await fs.readFile(mic),
		response = await fs.readFile(raw);
	const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(response)));
	const client = new ElevenLabs("mock", fetcher);
	const voiceCues = [
		{ id: crypto.randomUUID(), startMs: 0, settings: null, color: "#777777" },
		{
			id: crypto.randomUUID(),
			startMs: 1250,
			settings: { ...defaultVoiceSettings, voiceId: "voiceA", voiceName: "A" },
			color: "#224488",
		},
		{ id: crypto.randomUUID(), startMs: 2250, settings: null, color: "#777777" },
	];
	const metadata = {
		version: 1 as const,
		videoPath: path.join(dir, "take.mp4"),
		micPath: mic,
		systemAudioPath: null,
		micOffsetMs: 250,
		voiceCues,
	};
	const out = await convertCuedMicrophone(
		mic,
		{ ...defaultVoiceSettings, noticeAccepted: true },
		client,
		dir,
		new AbortController().signal,
		() => {},
		metadata,
	);
	expect(fetcher).toHaveBeenCalledTimes(1);
	expect(await fs.readFile(mic)).toEqual(original);
	expect(await audioDuration(out)).toBeCloseTo(3, 2);
	const samples = await pcm(out, dir);
	expect(frequency(samples, 0.1, 0.9)).toBeCloseTo(440, -1);
	expect(frequency(samples, 1.1, 1.9)).toBeCloseTo(880, -1);
	expect(frequency(samples, 2.1, 2.9)).toBeCloseTo(440, -1);
	const key = recordingVoiceKey(metadata, defaultVoiceSettings);
	expect(
		recordingVoiceKey(
			{
				...metadata,
				voiceCues: voiceCues.map((c, i) => (i === 1 ? { ...c, startMs: 1300 } : c)),
			},
			defaultVoiceSettings,
		),
	).not.toBe(key);
	expect(
		isVoiceExportReady(
			{ ...metadata, voiceChangeEnabled: true, micSelection: "original" },
			defaultVoiceSettings,
		),
	).toBe(false);
}, 20000);
test("voice boundaries reject malformed or duplicate timestamps", () => {
	const cue = { id: crypto.randomUUID(), startMs: 0, settings: null, color: "#777777" };
	expect(() => validateVoiceCues([cue, { ...cue, id: crypto.randomUUID() }])).toThrow();
	expect(() => validateVoiceCues([{ ...cue, startMs: 3 }])).toThrow();
	expect(() => validateVoiceCues([{ ...cue, settings: { voiceId: "oops" } }])).toThrow();
});
