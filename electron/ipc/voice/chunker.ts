import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { VoiceSettings } from "../../../src/types/voice";
import { getFfmpegBinaryPath, getFfprobeBinaryPath } from "../ffmpeg/binary";
const exec = promisify(execFile);
export interface VoiceChunk {
	start: number;
	end: number;
	overlap: number;
}
export function planChunks(
	duration: number,
	silences: Array<{ start: number; end: number }>,
): VoiceChunk[] {
	if (!Number.isFinite(duration) || duration <= 0 || duration > 86400)
		throw new Error("invalidAudio");
	const result: VoiceChunk[] = [];
	let start = 0;
	let overlap = 0;
	while (start < duration) {
		const limit = Math.min(duration, start + 240);
		let end = limit;
		let hard = false;
		if (limit < duration) {
			const points = silences
				.map((s) => Math.min(limit, (s.start + s.end) / 2))
				.filter(
					(p) =>
						p >= limit - 10 &&
						p > start &&
						silences.some((s) => p >= s.start && p <= s.end),
				);
			if (points.length) end = Math.max(...points);
			else hard = true;
		}
		result.push({ start, end, overlap });
		if (end >= duration) break;
		overlap = hard ? 0.05 : 0;
		start = end - overlap;
	}
	return result;
}
export function durationFilter(seconds: number) {
	if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("invalidAudio");
	return `apad,atrim=duration=${seconds.toFixed(6)},asetpts=PTS-STARTPTS`;
}
export function postFxFilter(settings: VoiceSettings["postFx"]) {
	const ratio = 2 ** (settings.pitchSemitones / 12);
	const eq =
		settings.eqPreset === "warm"
			? "equalizer=f=180:t=q:w=1:g=3"
			: settings.eqPreset === "bright"
				? "equalizer=f=3500:t=q:w=1:g=3"
				: null;
	return [
		settings.pitchSemitones
			? `asetrate=${48000 * ratio},aresample=48000,atempo=${1 / ratio}`
			: null,
		eq,
		`loudnorm=I=${settings.loudnessLufs}:TP=-1.5:LRA=11`,
		"aresample=48000",
	]
		.filter(Boolean)
		.join(",");
}
export async function ffmpeg(args: string[], signal?: AbortSignal) {
	await exec(getFfmpegBinaryPath(), ["-hide_banner", "-nostdin", "-n", ...args], {
		signal,
		timeout: 30 * 60 * 1000,
		maxBuffer: 20 * 1024 * 1024,
	});
}
export async function audioDuration(file: string, signal?: AbortSignal) {
	const { stdout } = await exec(
		getFfprobeBinaryPath(),
		["-v", "error", "-show_entries", "format=duration", "-of", "json", file],
		{ signal },
	);
	const n = Number(JSON.parse(stdout).format?.duration);
	if (!Number.isFinite(n) || n <= 0) throw new Error("invalidAudio");
	return n;
}
export async function silences(file: string, signal?: AbortSignal) {
	const { stderr } = await exec(
		getFfmpegBinaryPath(),
		[
			"-hide_banner",
			"-nostdin",
			"-i",
			file,
			"-af",
			"silencedetect=noise=-35dB:d=0.3",
			"-f",
			"null",
			"-",
		],
		{ signal, timeout: 30 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 },
	);
	const result: Array<{ start: number; end: number }> = [];
	let start = 0;
	for (const line of stderr.split("\n")) {
		const a = /silence_start: ([\d.]+)/.exec(line);
		const b = /silence_end: ([\d.]+)/.exec(line);
		if (a) start = Number(a[1]);
		if (b) result.push({ start, end: Number(b[1]) });
	}
	return result;
}
export function joinFilter(chunks: VoiceChunk[]) {
	let graph = "";
	let previous = "0:a";
	for (let i = 1; i < chunks.length; i++) {
		const next = `j${i}`;
		graph += `[${previous}][${i}:a]${chunks[i].overlap ? "acrossfade=d=0.05:c1=tri:c2=tri" : "concat=n=2:v=0:a=1"}[${next}];`;
		previous = next;
	}
	return { graph, output: previous };
}
