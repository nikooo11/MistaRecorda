import fs from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { cueSpans } from "../../../src/lib/voiceCues";
import { recordingVoiceKey } from "../../../src/lib/voiceExport";
import type { VoiceProgress, VoiceSettings } from "../../../src/types/voice";
import { validateVoiceCues } from "../../studio/validateVoiceCues";
import {
	type RecordingAudioMetadata,
	readAudioMetadata,
	recordingBase,
	writeAudioMetadata,
} from "../recording/library";
import {
	audioDuration,
	durationFilter,
	ffmpeg,
	joinFilter,
	planChunks,
	postFxFilter,
	silences,
} from "./chunker";
import type { ElevenLabs } from "./elevenlabs";
import { mixArgs } from "./mix";

const active = new Map<string, { controller: AbortController; progress: VoiceProgress }>();
const history = new Map<string, VoiceProgress>();
function emit(progress: VoiceProgress) {
	history.set(progress.videoPath, { ...progress });
	for (const win of BrowserWindow.getAllWindows())
		if (!win.isDestroyed()) win.webContents.send("voice:progress", progress);
}
export function jobProgress() {
	return [...history.values()];
}
export function cancelJob(jobId: string) {
	active.get(jobId)?.controller.abort();
	return true;
}
export async function convertMicrophone(
	micPath: string,
	settings: VoiceSettings,
	client: ElevenLabs,
	temp: string,
	signal: AbortSignal,
	onProgress: (completed: number, total: number) => void,
) {
	const workers = new AbortController();
	signal = AbortSignal.any([signal, workers.signal]);
	const duration = await audioDuration(micPath, signal);
	const chunks = planChunks(duration, await silences(micPath, signal));
	let cursor = 0;
	let completed = 0;
	onProgress(0, chunks.length);
	const outputs = chunks.map((_, i) => path.join(temp, `converted-${i}.wav`));
	const worker = async () => {
		while (cursor < chunks.length) {
			signal.throwIfAborted();
			const i = cursor++;
			const c = chunks[i];
			const input = path.join(temp, `mic-${i}.wav`);
			await ffmpeg(
				[
					"-ss",
					String(c.start),
					"-i",
					micPath,
					"-t",
					(c.end - c.start).toFixed(6),
					"-ac",
					"1",
					"-ar",
					"48000",
					"-c:a",
					"pcm_s16le",
					input,
				],
				signal,
			);
			const converted = await client.speech(await fs.readFile(input), settings, signal);
			const raw = path.join(temp, `response-${i}`);
			await fs.writeFile(raw, converted.bytes);
			await ffmpeg(
				[
					...(converted.format === "pcm_44100"
						? ["-f", "s16le", "-ar", "44100", "-ac", "1"]
						: []),
					"-i",
					raw,
					"-af",
					durationFilter(c.end - c.start),
					"-ac",
					"1",
					"-ar",
					"48000",
					"-c:a",
					"pcm_s16le",
					outputs[i],
				],
				signal,
			);
			onProgress(++completed, chunks.length);
		}
	};
	// Wait for both workers before cleanup, even on failure; neither can write into a removed temp dir.
	const guarded = async () => {
		try {
			await worker();
		} catch (error) {
			workers.abort(error);
			throw error;
		}
	};
	const results = await Promise.allSettled([guarded(), guarded()]);
	const failure = results.find((r) => r.status === "rejected");
	if (failure?.status === "rejected") throw failure.reason;
	signal.throwIfAborted();
	const joined = joinFilter(chunks);
	const output = path.join(temp, "voice-mic.wav");
	const graph = `${joined.graph}[${joined.output}]${postFxFilter(settings.postFx)},${durationFilter(duration)}[out]`;
	await ffmpeg(
		[
			...outputs.flatMap((p) => ["-i", p]),
			"-filter_complex",
			graph,
			"-map",
			"[out]",
			"-ac",
			"1",
			"-ar",
			"48000",
			"-c:a",
			"pcm_s16le",
			output,
		],
		signal,
	);
	if (Math.abs((await audioDuration(output, signal)) - duration) > 0.05)
		throw new Error("durationMismatch");
	return output;
}
export async function startVoiceJob(
	videoPath: string,
	settings: VoiceSettings,
	client: ElevenLabs,
) {
	if (!settings.noticeAccepted) throw new Error("noticeRequired");
	if ([...active.values()].some((j) => j.progress.videoPath === videoPath))
		throw new Error("alreadyRunning");
	const metadata = await readAudioMetadata(videoPath);
	if (!settings.voiceId && !metadata?.voiceCues?.some((c) => c.settings))
		throw new Error("chooseVoice");
	if (metadata?.voiceCues) metadata.voiceCues = validateVoiceCues(metadata.voiceCues);
	if (!metadata?.micPath) throw new Error("missingMic");
	// Resolve real paths too: a crafted sidecar symlink must not upload another file.
	if (
		!(await fs.lstat(metadata.micPath)).isFile() ||
		(await fs.realpath(metadata.micPath)) !==
			path.join(
				await fs.realpath(path.dirname(metadata.micPath)),
				path.basename(metadata.micPath),
			)
	)
		throw new Error("invalidAudio");
	const jobId = crypto.randomUUID();
	const controller = new AbortController();
	const progress: VoiceProgress = { jobId, videoPath, state: "running", completed: 0, total: 0 };
	active.set(jobId, { controller, progress });
	emit(progress);
	void run(metadata, settings, client, controller, progress);
	return jobId;
}
export async function convertCuedMicrophone(
	micPath: string,
	settings: VoiceSettings,
	client: ElevenLabs,
	temp: string,
	signal: AbortSignal,
	onProgress: (completed: number, total: number) => void,
	metadata: RecordingAudioMetadata,
) {
	const duration = await audioDuration(micPath, signal);
	const offset = metadata.micOffsetMs;
	const spans = cueSpans(validateVoiceCues(metadata.voiceCues), duration * 1000 + offset)
		.map((c) => ({
			...c,
			startMs: Math.max(0, c.startMs - offset),
			endMs: Math.max(0, c.endMs - offset),
		}))
		.filter((c) => c.endMs > c.startMs);
	const outputs: string[] = [];
	onProgress(0, spans.length);
	for (const [i, span] of spans.entries()) {
		signal.throwIfAborted();
		const folder = path.join(temp, `region-${i}`);
		await fs.mkdir(folder);
		const input = path.join(folder, "original.wav");
		await ffmpeg(
			[
				"-ss",
				String(span.startMs / 1000),
				"-i",
				micPath,
				"-t",
				String((span.endMs - span.startMs) / 1000),
				"-ar",
				"48000",
				"-ac",
				"1",
				"-c:a",
				"pcm_s16le",
				input,
			],
			signal,
		);
		outputs.push(
			span.settings
				? await convertMicrophone(
						input,
						{ ...span.settings, noticeAccepted: settings.noticeAccepted },
						client,
						folder,
						signal,
						() => {
							/* Overall progress counts completed regions. */
						},
					)
				: input,
		);
		onProgress(i + 1, spans.length);
	}
	const output = path.join(temp, "voice-mic.wav");
	if (!outputs.length) throw Error("invalidAudio");
	const graph = `${outputs.map((_, i) => `[${i}:a]`).join("")}concat=n=${outputs.length}:v=0:a=1,${durationFilter(duration)}[out]`;
	await ffmpeg(
		[
			...outputs.flatMap((p) => ["-i", p]),
			"-filter_complex",
			graph,
			"-map",
			"[out]",
			"-ac",
			"1",
			"-ar",
			"48000",
			"-c:a",
			"pcm_s16le",
			output,
		],
		signal,
	);
	return output;
}
async function run(
	metadata: RecordingAudioMetadata,
	settings: VoiceSettings,
	client: ElevenLabs,
	controller: AbortController,
	progress: VoiceProgress,
) {
	const temp = path.join(app.getPath("temp"), "mistarecorda-voice", progress.jobId);
	let committed = false;
	const created: string[] = [];
	try {
		await fs.mkdir(temp, { recursive: true });
		const convert = metadata.voiceCues?.some((c) => c.settings)
			? convertCuedMicrophone
			: convertMicrophone;
		const output = await convert(
			metadata.micPath!,
			settings,
			client,
			temp,
			controller.signal,
			(completed, total) => {
				Object.assign(progress, { completed, total });
				emit(progress);
			},
			metadata,
		);
		controller.signal.throwIfAborted();
		const base = recordingBase(metadata.videoPath);
		const suffix = metadata.changedMicPath ? `-${progress.jobId}` : "";
		const mic = `${base}.voice${suffix}-mic.wav`;
		await fs.copyFile(output, mic, 1);
		created.push(mic);
		controller.signal.throwIfAborted();
		const video = `${base}.voice${suffix}.mp4`;
		const temporaryVideo = path.join(temp, "voice.mp4");
		await ffmpeg(
			mixArgs(
				metadata,
				mic,
				temporaryVideo,
				await audioDuration(metadata.videoPath, controller.signal),
			),
			controller.signal,
		);
		controller.signal.throwIfAborted();
		await fs.copyFile(temporaryVideo, video, 1);
		created.push(video);
		await writeAudioMetadata({
			...metadata,
			...(await readAudioMetadata(metadata.videoPath)),
			changedMicPath: mic,
			voiceVideoPath: video,
			micSelection: "changed",
			changedVoiceId: settings.voiceId,
			changedVoiceName: metadata.voiceCues?.some((c) => c.settings)
				? "Recorded voice selections"
				: settings.voiceName,
			changedModelId: settings.modelId,
			changedSettingsKey: recordingVoiceKey(metadata, settings),
			voiceChangeEnabled: true,
		});
		committed = true;
		for (const win of BrowserWindow.getAllWindows())
			if (!win.isDestroyed()) win.webContents.send("voice:audioChanged", metadata.videoPath);
		Object.assign(progress, { state: "done", outputPath: video });
	} catch (e) {
		Object.assign(progress, {
			state: controller.signal.aborted ? "cancelled" : "error",
			error:
				e instanceof Error && /^[a-zA-Z]+$/.test(e.message) ? e.message : "operationFailed",
		});
	} finally {
		if (!committed) await Promise.all(created.map((p) => fs.rm(p, { force: true })));
		await fs.rm(temp, { recursive: true, force: true });
		active.delete(progress.jobId);
		emit(progress);
	}
}
