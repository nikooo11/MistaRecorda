import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getFfmpegBinaryPath, getFfprobeBinaryPath } from "../ffmpeg/binary";

const exec = promisify(execFile);
export interface RecordingAudioMetadata {
	version: 1;
	videoPath: string;
	micPath: string | null;
	systemAudioPath: string | null;
	micOffsetMs: number;
	systemOffsetMs?: number;
	changedMicPath?: string;
	voiceVideoPath?: string;
	micSelection?: "original" | "changed";
	changedVoiceName?: string;
	changedVoiceId?: string;
	changedModelId?: string;
}
export function recordingBase(videoPath: string) {
	return videoPath.slice(0, videoPath.length - path.extname(videoPath).length);
}
export function audioMetadataPath(videoPath: string) {
	return `${recordingBase(videoPath)}.mistarecorda-audio.json`;
}
export async function readAudioMetadata(videoPath: string): Promise<RecordingAudioMetadata | null> {
	try {
		const data = JSON.parse(await fs.readFile(audioMetadataPath(videoPath), "utf8"));
		if (
			data.version !== 1 ||
			data.videoPath !== videoPath ||
			!Number.isFinite(data.micOffsetMs) ||
			(data.systemOffsetMs !== undefined &&
				(!Number.isFinite(data.systemOffsetMs) || data.systemOffsetMs < 0))
		)
			return null;
		// Never trust a metadata file to redirect uploads outside its recording's sidecars.
		const base = recordingBase(videoPath);
		if (data.micPath && data.micPath !== `${base}.mic.wav`) return null;
		if (
			data.systemAudioPath &&
			![".system.m4a", ".system.wav", ".system.webm"].some(
				(s) => data.systemAudioPath === base + s,
			)
		)
			return null;
		if (
			data.changedMicPath &&
			!new RegExp(`^${escapeRegex(base)}\\.voice(?:-[a-zA-Z0-9-]+)?-mic\\.wav$`).test(
				data.changedMicPath,
			)
		)
			return null;
		if (
			data.voiceVideoPath &&
			!new RegExp(`^${escapeRegex(base)}\\.voice(?:-[a-zA-Z0-9-]+)?\\.mp4$`).test(
				data.voiceVideoPath,
			)
		)
			return null;
		return data;
	} catch {
		return null;
	}
}
function escapeRegex(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export async function writeAudioMetadata(data: RecordingAudioMetadata) {
	const target = audioMetadataPath(data.videoPath);
	const temp = `${target}.${crypto.randomUUID()}.tmp`;
	try {
		await fs.writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
		await fs.rename(temp, target);
	} finally {
		await fs.rm(temp, { force: true });
	}
}
async function firstExisting(paths: string[]) {
	for (const candidate of paths)
		if (
			await fs
				.stat(candidate)
				.then((s) => s.isFile() && s.size > 0)
				.catch(() => false)
		)
			return candidate;
	return null;
}
/** Only known mic sidecars are eligible. Never extract the video's audio for STS. */
export async function prepareRecordingAudio(videoPath: string, measuredOffsetMs?: number) {
	const previous = await readAudioMetadata(videoPath);
	const base = recordingBase(videoPath);
	const micPath = `${base}.mic.wav`;
	const source = await firstExisting([
		micPath,
		`${base}.mic.source.wav`,
		`${base}.mic.m4a`,
		`${base}.mic.webm`,
	]);
	let micOffsetMs = previous?.micOffsetMs ?? 0;
	if (source && source !== micPath) {
		const { stdout } = await exec(getFfprobeBinaryPath(), [
			"-v",
			"error",
			"-select_streams",
			"a:0",
			"-show_entries",
			"stream=start_time",
			"-of",
			"json",
			source,
		]);
		const start = Number(JSON.parse(stdout).streams?.[0]?.start_time ?? 0);
		micOffsetMs = Math.max(0, Math.round((Number.isFinite(start) ? start : 0) * 1000));
		await exec(getFfmpegBinaryPath(), [
			"-nostdin",
			"-n",
			"-i",
			source,
			"-map",
			"0:a:0",
			"-vn",
			"-af",
			"asetpts=PTS-STARTPTS",
			"-ac",
			"1",
			"-ar",
			"48000",
			"-c:a",
			"pcm_s16le",
			micPath,
		]);
	}
	if (measuredOffsetMs !== undefined && Number.isFinite(measuredOffsetMs))
		micOffsetMs = Math.max(0, Math.round(measuredOffsetMs));
	else if (source) {
		try {
			const timing = JSON.parse(await fs.readFile(`${micPath}.json`, "utf8"));
			if (Number.isFinite(timing.startDelayMs))
				micOffsetMs = Math.max(0, Math.round(timing.startDelayMs));
		} catch {
			/* Native WAV starts at the measured/default offset. */
		}
	}
	const systemAudioPath = await firstExisting([
		`${base}.system.m4a`,
		`${base}.system.wav`,
		`${base}.system.webm`,
	]);
	let systemOffsetMs = previous?.systemOffsetMs ?? 0;
	if (systemAudioPath) {
		try {
			const timing = JSON.parse(await fs.readFile(`${systemAudioPath}.json`, "utf8"));
			if (Number.isFinite(timing.startDelayMs))
				systemOffsetMs = Math.max(0, Math.round(timing.startDelayMs));
		} catch {
			/* Browser sidecar delay is already baked in; native timing is optional. */
		}
	}
	const metadata: RecordingAudioMetadata = {
		...previous,
		version: 1,
		videoPath,
		micPath: source ? micPath : null,
		systemAudioPath,
		systemOffsetMs,
		micOffsetMs,
	};
	await writeAudioMetadata(metadata);
	return metadata;
}
