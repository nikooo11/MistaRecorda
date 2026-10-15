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
import { convertMicrophone, startVoiceJob, jobProgress } from "./job";
import { prepareRecordingAudio, readAudioMetadata, writeAudioMetadata } from "../recording/library";
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
	test("restricted output formats fall back to 128 kbps, including modern 403 errors", async () => {
		const denied = () =>
			new Response(JSON.stringify({ detail: { code: "output_format_not_allowed" } }), {
				status: 403,
			});
		const f = vi
			.fn()
			.mockResolvedValueOnce(denied())
			.mockResolvedValueOnce(denied())
			.mockResolvedValueOnce(new Response(new Uint8Array([1])));
		const result = await new ElevenLabs("test", f).speech(
			new Uint8Array([1]),
			defaultVoiceSettings,
			new AbortController().signal,
		);
		expect(result.format).toBe("mp3_44100_128");
		expect(f).toHaveBeenCalledTimes(3);
	});
	test("recognizes an explicit format-tier subscription denial without exposing the body", async () => {
		const f = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						detail: {
							status: "subscription_required",
							message:
								"Output format 'pcm_44100' is only available on the Pro tier and above.",
						},
					}),
					{ status: 403 },
				),
			)
			.mockResolvedValueOnce(new Response(new Uint8Array([1])));
		expect(
			(
				await new ElevenLabs("test", f).speech(
					new Uint8Array([1]),
					defaultVoiceSettings,
					new AbortController().signal,
				)
			).format,
		).toBe("mp3_44100_192");
		expect(f).toHaveBeenCalledTimes(2);
	});
	test("does not retry an unrelated subscription restriction", async () => {
		const f = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					detail: {
						status: "subscription_required",
						message: "This voice requires a paid plan.",
					},
				}),
				{ status: 403 },
			),
		);
		await expect(
			new ElevenLabs("test", f).speech(
				new Uint8Array([1]),
				defaultVoiceSettings,
				new AbortController().signal,
			),
		).rejects.toThrow("planRequired");
		expect(f).toHaveBeenCalledTimes(1);
	});
	test.each([
		"missing_permissions",
		"insufficient_permissions",
	])("explains %s without retrying or leaking response content", async (code) => {
		const f = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ detail: { code, message: "private response" } }), {
				status: 403,
			}),
		);
		await expect(
			new ElevenLabs("test", f).speech(
				new Uint8Array([1]),
				defaultVoiceSettings,
				new AbortController().signal,
			),
		).rejects.toThrow("missingApiPermission");
		expect(f).toHaveBeenCalledTimes(1);
	});
	test("category never establishes voice ownership", () => {
		expect(mapVoice({ voice_id: "a", name: "A", category: "cloned" }).canEdit).toBe(false);
		expect(
			mapVoice({ voice_id: "a", name: "A", category: "cloned", is_owner: true }).canEdit,
		).toBe(true);
		const publicVoice = mapVoice({
			voice_id: "public",
			name: "Public voice",
			category: "professional",
			sharing: { public_owner_id: "owner" },
		});
		expect(publicVoice.source).toBe("library");
		expect(publicVoice.canEdit).toBe(false);
	});
});
describe("settings and secrets", () => {
	test("startup settings never unlock Keychain, even with a saved key", async () => {
		const dir = await temp();
		const storage = {
			isEncryptionAvailable: vi.fn(() => true),
			encryptString: vi.fn(Buffer.from),
			decryptString: vi.fn(() => "test-key"),
		};
		const store = new VoiceSettingsStore(dir, storage, () => undefined);
		expect((await store.publicSettings()).hasKey).toBe(false);
		expect(await store.key()).toBeUndefined();
		await fs.writeFile(path.join(dir, "voice-key.enc"), "encrypted-test");
		expect((await store.publicSettings()).hasKey).toBe(true);
		await store.save(defaultVoiceSettings);
		expect(storage.isEncryptionAvailable).not.toHaveBeenCalled();
		expect(storage.decryptString).not.toHaveBeenCalled();
		expect(await store.key()).toBe("test-key");
		expect(storage.decryptString).toHaveBeenCalledTimes(1);
	});
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

test.each([
	{ platform: "Windows", micSuffix: ".mic.source.wav", systemSuffix: ".system.wav" },
	{ platform: "macOS", micSuffix: ".mic.m4a", systemSuffix: ".system.m4a" },
])("$platform job uploads only normalized microphone samples and preserves system/video sources", async ({
	micSuffix,
	systemSuffix,
}) => {
	const dir = await temp();
	const base = path.join(dir, "recording-123");
	const video = `${base}.mp4`;
	const source = base + micSuffix;
	const system = base + systemSuffix;
	await ffmpeg([
		"-f",
		"lavfi",
		"-i",
		"color=black:size=64x64:rate=10:duration=1",
		"-c:v",
		"libx264",
		video,
	]);
	await ffmpeg([
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=440:duration=1",
		"-ar",
		"44100",
		"-ac",
		"2",
		source,
	]);
	await ffmpeg([
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=1700:duration=1",
		"-ar",
		"48000",
		"-ac",
		"2",
		system,
	]);
	await fs.writeFile(`${base}.mic.wav.json`, JSON.stringify({ startDelayMs: 25 }));
	await fs.writeFile(`${system}.json`, JSON.stringify({ startDelayMs: 40 }));
	const originalMic = await fs.readFile(source);
	const originalSystem = await fs.readFile(system);
	const originalVideo = await fs.readFile(video);
	const metadata = await prepareRecordingAudio(video);
	expect(metadata.micOffsetMs).toBe(25);
	expect(metadata.systemOffsetMs).toBe(40);
	const canonicalWav = await fs.readFile(metadata.micPath!);
	const fmt = canonicalWav.indexOf("fmt ");
	expect(canonicalWav.readUInt16LE(fmt + 10)).toBe(1);
	expect(canonicalWav.readUInt32LE(fmt + 12)).toBe(48000);
	expect(canonicalWav.readUInt16LE(fmt + 22)).toBe(16);
	const graph = mixArgs(metadata, "changed.wav", "out.mp4", 1);
	expect(graph[graph.indexOf("-filter_complex") + 1]).toContain(
		"[2:a]adelay=40:all=1[system];[1:a]adelay=25:all=1",
	);
	const expected = path.join(dir, "expected.pcm");
	await ffmpeg(["-i", metadata.micPath!, "-f", "s16le", "-ar", "48000", "-ac", "1", expected]);
	const response = path.join(dir, "response.pcm");
	await ffmpeg([
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=880:duration=1",
		"-f",
		"s16le",
		"-ar",
		"44100",
		"-ac",
		"1",
		response,
	]);
	const uploaded = path.join(dir, "uploaded.wav");
	const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
		const audio = (init?.body as FormData).get("audio") as Blob;
		await fs.writeFile(uploaded, Buffer.from(await audio.arrayBuffer()));
		return new Response(await fs.readFile(response));
	});
	const id = await startVoiceJob(
		video,
		{ ...defaultVoiceSettings, noticeAccepted: true, voiceId: "favorite" },
		new ElevenLabs("mock", fetcher),
	);
	await vi.waitFor(() => expect(jobProgress().find((p) => p.jobId === id)?.state).toBe("done"), {
		timeout: 15000,
		interval: 50,
	});
	expect(fetcher).toHaveBeenCalledTimes(1);
	const decoded = path.join(dir, "uploaded.pcm");
	await ffmpeg(["-i", uploaded, "-f", "s16le", "-ar", "48000", "-ac", "1", decoded]);
	// Exact PCM equality excludes the distinctly different system tone from the upload.
	expect(await fs.readFile(decoded)).toEqual(await fs.readFile(expected));
	expect(await fs.readFile(source)).toEqual(originalMic);
	expect(await fs.readFile(system)).toEqual(originalSystem);
	expect(await fs.readFile(video)).toEqual(originalVideo);
	expect(await readAudioMetadata(video)).toMatchObject({
		voiceVideoPath: `${base}.voice.mp4`,
		micSelection: "changed",
		changedVoiceId: "favorite",
		changedModelId: "eleven_multilingual_sts_v2",
	});
}, 20000);

test("system-only recording cannot be uploaded as a microphone fallback", async () => {
	const dir = await temp();
	const video = path.join(dir, "recording-456.mp4");
	await fs.writeFile(path.join(dir, "recording-456.system.wav"), "system-only");
	await prepareRecordingAudio(video);
	const fetcher = vi.fn();
	await expect(
		startVoiceJob(
			video,
			{ ...defaultVoiceSettings, noticeAccepted: true, voiceId: "favorite" },
			new ElevenLabs("mock", fetcher),
		),
	).rejects.toThrow("missingMic");
	expect(fetcher).not.toHaveBeenCalled();
});

test("a symlink microphone sidecar cannot redirect the voice upload", async () => {
	const dir = await temp();
	const video = path.join(dir, "recording-999.mp4");
	const microphone = path.join(dir, "recording-999.mic.wav");
	const unrelated = path.join(dir, "unrelated.wav");
	await fs.writeFile(unrelated, "not a recording");
	await fs.symlink(unrelated, microphone);
	await writeAudioMetadata({
		version: 1,
		videoPath: video,
		micPath: microphone,
		systemAudioPath: null,
		micOffsetMs: 0,
	});
	const fetcher = vi.fn<typeof fetch>();
	await expect(
		startVoiceJob(
			video,
			{ ...defaultVoiceSettings, noticeAccepted: true, voiceId: "test" },
			new ElevenLabs("mock", fetcher),
		),
	).rejects.toThrow("invalidAudio");
	expect(fetcher).not.toHaveBeenCalled();
});

test("loads model capability flags without assuming a newer TTS model can convert speech", async () => {
	const client = new ElevenLabs(
		"test",
		vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify([
					{
						model_id: "eleven_multilingual_sts_v2",
						name: "Multilingual v2",
						can_do_voice_conversion: true,
						can_do_text_to_speech: false,
					},
					{
						model_id: "eleven_v3",
						name: "Eleven v3",
						can_do_voice_conversion: false,
						can_do_text_to_speech: true,
					},
				]),
			),
		),
	);
	const models = await client.models();
	expect(models.filter((m) => m.canConvert).map((m) => m.modelId)).toEqual([
		"eleven_multilingual_sts_v2",
	]);
	expect(models[1].canSpeak).toBe(true);
});
test("preserves provider voice quality models without inventing versions", () => {
	expect(
		mapVoice({
			voice_id: "a",
			name: "A",
			high_quality_base_model_ids: ["eleven_v3", "eleven_multilingual_v2", null, 1],
		}).highQualityModelIds,
	).toEqual(["eleven_v3", "eleven_multilingual_v2"]);
	expect(mapVoice({ voice_id: "b", name: "B" }).highQualityModelIds).toEqual([]);
});

test("instant cloning uploads selected samples and returns verification without selecting or processing", async () => {
	const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
		new Response(JSON.stringify({ voice_id: "new-clone", requires_verification: true }), {
			status: 200,
		}),
	);
	const api = new ElevenLabs("test-key", fetcher);
	await expect(
		api.createVoice({ name: "Team narrator", description: "Clean speech" }, [
			{ name: "sample.wav", bytes: new Uint8Array([1, 2, 3]) },
		]),
	).resolves.toEqual({ voiceId: "new-clone", requiresVerification: true });
	expect(fetcher).toHaveBeenCalledTimes(1);
	const [url, init] = fetcher.mock.calls[0];
	expect(url).toBe("https://api.elevenlabs.io/v1/voices/add");
	const form = init!.body as FormData;
	expect(form.get("name")).toBe("Team narrator");
	expect((form.getAll("files")[0] as File).name).toBe("sample.wav");
});
test("ambiguous clone failures are not automatically retried", async () => {
	const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 500 }));
	await expect(
		new ElevenLabs("key", fetcher).createVoice({ name: "Voice", description: "" }, [
			{ name: "sample.wav", bytes: new Uint8Array([1]) },
		]),
	).rejects.toThrow("serviceUnavailable");
	expect(fetcher).toHaveBeenCalledTimes(1);
});
