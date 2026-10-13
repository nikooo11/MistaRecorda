import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { defaultVoiceSettings } from "../../../src/types/voice";
vi.mock("electron", () => ({
	app: { getPath: () => os.tmpdir(), isPackaged: false },
	BrowserWindow: { getAllWindows: () => [] },
}));
import { audioDuration, durationFilter, ffmpeg, joinFilter, planChunks } from "./chunker";
import { ElevenLabs, errorCode, mapVoice, voiceForm } from "./elevenlabs";
import { convertMicrophone } from "./job";
import { mixArgs } from "./mix";
import { validateSettings, VoiceSettingsStore } from "./settings";
const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});
async function temp() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "voice-test-"));
	dirs.push(dir);
	return dir;
}
describe("chunk planning", () => {
	test.each([
		1, 239.9, 240, 240.01, 480, 721, 3600,
	])("never exceeds 4 minutes and retains duration: %s", (duration) => {
		const chunks = planChunks(duration, []);
		expect(chunks.every((c) => Number((c.end - c.start).toFixed(6)) <= 240)).toBe(true);
		expect(chunks.reduce((sum, c) => sum + c.end - c.start - c.overlap, 0)).toBeCloseTo(
			duration,
			5,
		);
		expect(chunks[0].start).toBe(0);
		expect(chunks.at(-1)?.end).toBe(duration);
	});
	test("prefers available silence without going beyond upload limit", () => {
		const chunks = planChunks(500, [
			{ start: 233, end: 235 },
			{ start: 241, end: 243 },
		]);
		expect(chunks[0].end).toBe(234);
		expect(chunks[1].overlap).toBe(0);
		expect(joinFilter(chunks).graph).toContain("concat=n=2");
	});
	test("hard cuts overlap rather than accumulating 50ms drift", () => {
		const chunks = planChunks(1000, []);
		expect(chunks[1].start).toBe(239.95);
		expect(joinFilter(chunks).graph).toContain("acrossfade=d=0.05");
	});
	test.each([0, -1, NaN, Infinity])("rejects invalid duration %s", (n) =>
		expect(() => planChunks(n, [])).toThrow("invalidAudio"));
	test("duration fix pads and trims", () =>
		expect(durationFilter(3.123)).toBe("apad,atrim=duration=3.123000,asetpts=PTS-STARTPTS"));
});
describe("ElevenLabs", () => {
	test("multipart contains mic and exact settings, not video or key", async () => {
		const form = voiceForm(new Uint8Array([1, 2, 3]), defaultVoiceSettings);
		expect([...form.keys()].sort()).toEqual([
			"audio",
			"model_id",
			"remove_background_noise",
			"voice_settings",
		]);
		expect(form.get("model_id")).toBe("eleven_multilingual_sts_v2");
		expect(JSON.parse(String(form.get("voice_settings")))).toEqual({
			stability: 0.5,
			similarity_boost: 0.75,
			style: 0,
			use_speaker_boost: true,
		});
	});
	test("retry 429 and 5xx four times with bounded backoff", async () => {
		const fetcher = vi
			.fn()
			.mockImplementation(() => Promise.resolve(new Response(null, { status: 429 })));
		const sleep = vi.fn().mockResolvedValue(undefined);
		await expect(new ElevenLabs("test-key", fetcher, sleep).testKey()).rejects.toThrow(
			"rateLimited",
		);
		expect(fetcher).toHaveBeenCalledTimes(5);
		expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000, 4000, 8000]);
	});
	test("succeeds after transient failure and sends key only in header", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 503 }))
			.mockResolvedValueOnce(new Response("{}"));
		await expect(
			new ElevenLabs("private-test", fetcher, async () => {}).testKey(),
		).resolves.toBe(true);
		expect(fetcher.mock.calls[0][1].headers["xi-api-key"]).toBe("private-test");
		expect(fetcher.mock.calls[0][0]).toBe("https://api.elevenlabs.io/v1/user");
	});
	test.each([
		[401, "invalidKey"],
		[402, "outOfCredits"],
		[422, "invalidAudio"],
	])("does not retry terminal %s", async (status, code) => {
		const f = vi.fn().mockResolvedValue(new Response(null, { status: Number(status) }));
		await expect(new ElevenLabs("test", f).testKey()).rejects.toThrow(String(code));
		expect(f).toHaveBeenCalledTimes(1);
		expect(errorCode(Number(status))).toBe(code);
	});
	test("cancellation interrupts retry wait", async () => {
		const controller = new AbortController();
		const f = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
		const api = new ElevenLabs("test", f, async (_ms, signal) => {
			controller.abort();
			signal?.throwIfAborted();
		});
		await expect(api.request("/user", { signal: controller.signal })).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(f).toHaveBeenCalledTimes(1);
	});
	test("PCM format denial falls back to MP3 only", async () => {
		const f = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ detail: { status: "invalid_output_format" } }), {
					status: 400,
				}),
			)
			.mockResolvedValueOnce(new Response(new Uint8Array([1, 2])));
		const api = new ElevenLabs("test", f);
		const r = await api.speech(
			new Uint8Array([1]),
			{ ...defaultVoiceSettings, voiceId: "voice/1" },
			new AbortController().signal,
		);
		expect(r.format).toBe("mp3_44100_192");
		expect(f.mock.calls[1][0]).toContain("voice%2F1?output_format=mp3_44100_192");
	});
	test("category never establishes voice ownership", () => {
		expect(mapVoice({ voice_id: "a", name: "A", category: "cloned" }).canEdit).toBe(false);
		expect(
			mapVoice({ voice_id: "a", name: "A", category: "cloned", is_owner: true }).canEdit,
		).toBe(true);
	});
});
describe("settings and secrets", () => {
	test("encrypted key is never in public settings or JSON", async () => {
		const dir = await temp();
		const store = new VoiceSettingsStore(
			dir,
			{
				isEncryptionAvailable: () => true,
				encryptString: (s) => Buffer.from(s.split("").reverse().join("")),
				decryptString: (b) => b.toString().split("").reverse().join(""),
			},
			() => undefined,
		);
		await store.setKey("private-test-key");
		await store.save(defaultVoiceSettings);
		expect(await store.key()).toBe("private-test-key");
		expect(await store.publicSettings()).toEqual({ ...defaultVoiceSettings, hasKey: true });
		expect(await fs.readFile(path.join(dir, "voice-key.enc"), "utf8")).not.toContain(
			"private-test-key",
		);
		expect(await fs.readFile(path.join(dir, "voice-settings.json"), "utf8")).not.toContain(
			"private-test-key",
		);
	});
	test("rejects insecure storage and strips unrecognized fields", async () => {
		const store = new VoiceSettingsStore(
			await temp(),
			{
				isEncryptionAvailable: () => true,
				getSelectedStorageBackend: () => "basic_text",
				encryptString: Buffer.from,
				decryptString: (b) => b.toString(),
			},
			() => undefined,
		);
		await expect(store.setKey("secret")).rejects.toThrow("secureStorageUnavailable");
		expect(validateSettings({ ...defaultVoiceSettings, apiKey: "secret" })).not.toHaveProperty(
			"apiKey",
		);
		expect(() => validateSettings({ ...defaultVoiceSettings, stability: 2 })).toThrow(
			"invalidSettings",
		);
	});
});
test("quick output copies video, delays mic and never processes the system input", () => {
	const args = mixArgs(
		{
			version: 1,
			videoPath: "screen.mp4",
			micPath: "mic.wav",
			systemAudioPath: "system.m4a",
			micOffsetMs: 125,
		},
		"changed.wav",
		"out.mp4",
		10,
	);
	expect(args).toContain("copy");
	expect(args[args.indexOf("-filter_complex") + 1]).toContain("[1:a]adelay=125:all=1");
	expect(args[args.indexOf("-filter_complex") + 1]).toContain(
		"[2:a][mic]amix=inputs=2:normalize=0",
	);
	expect(args).not.toContain("-y");
});
test("actual ffmpeg conversion normalizes and fits a mocked PCM response within 50ms", async () => {
	const dir = await temp();
	const mic = path.join(dir, "original.mic.wav");
	await ffmpeg([
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=440:duration=2",
		"-ac",
		"1",
		"-ar",
		"48000",
		mic,
	]);
	const raw = path.join(dir, "mock.pcm");
	await ffmpeg(["-i", mic, "-f", "s16le", "-ar", "44100", "-ac", "1", raw]);
	const original = await fs.readFile(mic);
	const api = new ElevenLabs(
		"mock",
		vi.fn().mockResolvedValue(new Response(await fs.readFile(raw))),
	);
	const progress = vi.fn();
	const out = await convertMicrophone(
		mic,
		defaultVoiceSettings,
		api,
		dir,
		new AbortController().signal,
		progress,
	);
	expect(Math.abs((await audioDuration(out)) - 2)).toBeLessThanOrEqual(0.05);
	expect(await fs.readFile(mic)).toEqual(original);
	expect(progress).toHaveBeenLastCalledWith(1, 1);
}, 20000);
