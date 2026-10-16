import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getFfmpegBinaryPath, getFfprobeBinaryPath } from "../ffmpeg/binary";
import { MAX_CURSOR_SAMPLES } from "../constants";
import { getTelemetryPathForVideo } from "../utils";
import {
	prepareRecordingAudio,
	readAudioMetadata,
	recordingBase,
	writeAudioMetadata,
} from "./library";

const exec = promisify(execFile);

export interface ClipSource {
	videoPath: string;
	webcamPath?: string | null;
	/** Webcam media starts this many ms into the screen video (see webcamSync.ts). */
	timeOffsetMs?: number;
}
export interface AppendedRecording {
	videoPath: string;
	webcamPath: string | null;
	firstDurationMs: number;
	secondDurationMs: number;
}
interface Stream {
	codec_type?: string;
	codec_name?: string;
	width?: number;
	height?: number;
	pix_fmt?: string;
	sample_rate?: string;
	channels?: number;
	avg_frame_rate?: string;
	extradata_hash?: string;
}
interface Probe {
	durationMs: number;
	video?: Stream;
	audio?: Stream;
}

async function probe(file: string): Promise<Probe> {
	const { stdout } = await exec(
		getFfprobeBinaryPath(),
		[
			"-v",
			"error",
			"-show_data_hash",
			"sha256",
			"-show_entries",
			"format=duration:stream=codec_type,codec_name,width,height,pix_fmt,sample_rate,channels,avg_frame_rate,extradata_hash",
			"-of",
			"json",
			file,
		],
		{ maxBuffer: 4 * 1024 * 1024 },
	);
	const data = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Stream[] };
	const durationMs = Math.round(Number(data.format?.duration) * 1000);
	if (!Number.isFinite(durationMs) || durationMs <= 0)
		throw Error(`Could not read the length of ${path.basename(file)}.`);
	return {
		durationMs,
		video: data.streams?.find((s) => s.codec_type === "video"),
		audio: data.streams?.find((s) => s.codec_type === "audio"),
	};
}

const sameStream = (a?: Stream, b?: Stream) =>
	!a === !b &&
	(!a ||
		(
			[
				"codec_name",
				"width",
				"height",
				"pix_fmt",
				"sample_rate",
				"channels",
				"extradata_hash",
			] as const
		).every((k) => a[k] === b?.[k]));

/** Stream copy is only safe when both files were encoded with identical parameters. */
export function canCopyConcat(a: Probe, b: Probe) {
	return Boolean(a.video) && sameStream(a.video, b.video) && sameStream(a.audio, b.audio);
}

const seconds = (ms: number) => (Math.max(0, ms) / 1000).toFixed(3);
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
function frameRate(stream?: Stream) {
	const [n, d] = (stream?.avg_frame_rate ?? "").split("/").map(Number);
	const fps = n && d ? n / d : 30;
	return Math.min(60, Math.max(24, Math.round(fps)));
}
function videoEncoder(bitrate: string) {
	return process.platform === "darwin"
		? ["-c:v", "h264_videotoolbox", "-b:v", bitrate, "-allow_sw", "1"]
		: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18"];
}
async function ffmpeg(args: string[]) {
	await exec(
		getFfmpegBinaryPath(),
		["-nostdin", "-hide_banner", "-loglevel", "error", "-y", ...args],
		{
			maxBuffer: 16 * 1024 * 1024,
		},
	);
}

/** One aligned segment per clip: shifted by its start offset, then padded/trimmed to the clip length. */
export function alignedAudioSegment(
	input: number | null,
	offsetMs: number,
	durationMs: number,
	layout: "mono" | "stereo",
	label: string,
) {
	const end = `atrim=duration=${seconds(durationMs)},asetpts=PTS-STARTPTS[${label}]`;
	if (input === null) return `anullsrc=r=48000:cl=${layout},${end}`;
	const shift =
		offsetMs > 0
			? `,adelay=${Math.round(offsetMs)}:all=1`
			: offsetMs < 0
				? `,atrim=start=${seconds(-offsetMs)},asetpts=PTS-STARTPTS`
				: "";
	return `[${input}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_rates=48000:channel_layouts=${layout}${shift},apad,${end}`;
}

async function concatAudio(
	parts: Array<{ file: string | null; offsetMs: number; durationMs: number }>,
	layout: "mono" | "stereo",
	output: string,
	codec: string[],
) {
	const inputs = parts.flatMap((p) => (p.file ? ["-i", p.file] : []));
	let next = 0;
	const filters = parts.map((p, i) =>
		alignedAudioSegment(p.file ? next++ : null, p.offsetMs, p.durationMs, layout, `s${i}`),
	);
	await ffmpeg([
		...inputs,
		"-filter_complex",
		`${filters.join(";")};${parts.map((_, i) => `[s${i}]`).join("")}concat=n=${parts.length}:v=0:a=1[out]`,
		"-map",
		"[out]",
		...codec,
		output,
	]);
}

async function concatScreen(first: string, second: string, a: Probe, b: Probe, output: string) {
	if (canCopyConcat(a, b)) {
		const list = `${output}.txt`;
		const quote = (f: string) => `file '${f.replace(/'/g, "'\\''")}'`;
		await fs.writeFile(list, `${quote(first)}\n${quote(second)}\n`);
		try {
			await ffmpeg([
				"-f",
				"concat",
				"-safe",
				"0",
				"-i",
				list,
				"-map",
				"0",
				"-c",
				"copy",
				"-movflags",
				"+faststart",
				output,
			]);
			return;
		} catch {
			// Fall through to a re-encode when the container rejects the copy.
		} finally {
			await fs.rm(list, { force: true });
		}
	}
	const width = even(a.video?.width ?? b.video?.width ?? 1920);
	const height = even(a.video?.height ?? b.video?.height ?? 1080);
	const fps = frameRate(a.video);
	const fit = (i: number) =>
		`[${i}:v]setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[v${i}]`;
	const audio = Boolean(a.audio || b.audio);
	const filters = [fit(0), fit(1)];
	if (audio)
		[a, b].forEach((p, i) =>
			filters.push(
				alignedAudioSegment(p.audio ? i : null, 0, p.durationMs, "stereo", `a${i}`),
			),
		);
	await ffmpeg([
		"-i",
		first,
		"-i",
		second,
		"-filter_complex",
		`${filters.join(";")};${audio ? "[v0][a0][v1][a1]" : "[v0][v1]"}concat=n=2:v=1:a=${audio ? 1 : 0}[v]${audio ? "[a]" : ""}`,
		"-map",
		"[v]",
		...(audio ? ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"] : []),
		...videoEncoder("24M"),
		"-movflags",
		"+faststart",
		output,
	]);
}

async function concatWebcam(
	parts: Array<{ file: string | null; offsetMs: number; durationMs: number }>,
	output: string,
) {
	const present = parts.filter((p) => p.file);
	const sizes = await Promise.all(present.map((p) => probe(p.file!)));
	const width = even(sizes[0]?.video?.width ?? 1280);
	const height = even(sizes[0]?.video?.height ?? 720);
	let next = 0;
	const filters = parts.map((p, i) => {
		const end = `trim=duration=${seconds(p.durationMs)},setpts=PTS-STARTPTS[w${i}]`;
		if (!p.file)
			return `color=c=black:s=${width}x${height}:r=30:d=${seconds(p.durationMs)},format=yuv420p,${end}`;
		const shift =
			p.offsetMs > 0
				? `,tpad=start_mode=add:start_duration=${seconds(p.offsetMs)}:color=black`
				: p.offsetMs < 0
					? `,trim=start=${seconds(-p.offsetMs)},setpts=PTS-STARTPTS`
					: "";
		return `[${next++}:v]setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p${shift},tpad=stop_mode=clone:stop_duration=${seconds(p.durationMs)},${end}`;
	});
	await ffmpeg([
		...present.flatMap((p) => ["-i", p.file!]),
		"-filter_complex",
		`${filters.join(";")};${parts.map((_, i) => `[w${i}]`).join("")}concat=n=${parts.length}:v=1:a=0[v]`,
		"-map",
		"[v]",
		"-an",
		...videoEncoder("6M"),
		"-movflags",
		"+faststart",
		output,
	]);
}

async function readJson<T>(file: string): Promise<T | null> {
	try {
		return JSON.parse(await fs.readFile(file, "utf8")) as T;
	} catch {
		return null;
	}
}
const exists = (file?: string | null) =>
	file
		? fs
				.stat(file)
				.then((s) => s.isFile() && s.size > 0)
				.catch(() => false)
		: Promise.resolve(false);

type Timed = { timeMs: number };
type Region = { id: string; startMs: number; endMs: number };
/** Second-clip cursor samples follow the first clip on the joined timeline. */
export function joinCursorTelemetry<T extends { samples?: Timed[] }>(
	first: T | null,
	second: T | null,
	offsetMs: number,
) {
	if (!first?.samples && !second?.samples) return null;
	const samples = [
		...(first?.samples ?? []).filter((s) => s.timeMs < offsetMs),
		...(second?.samples ?? []).map((s) => ({ ...s, timeMs: s.timeMs + offsetMs })),
	].slice(0, MAX_CURSOR_SAMPLES);
	return { ...(first ?? second), samples };
}
export function shiftRegions<T extends Region>(regions: T[], offsetMs: number, idPrefix: string) {
	return regions.map((r) => ({
		...r,
		id: `${idPrefix}${r.id}`,
		startMs: r.startMs + offsetMs,
		endMs: r.endMs + offsetMs,
	}));
}

async function joinSounds(first: string, second: string, output: string, offsetMs: number) {
	type Sound = Region & { audioPath: string };
	const files = new Map<string, string>();
	const regions: Sound[] = [];
	for (const [video, shift] of [
		[first, 0],
		[second, offsetMs],
	] as const) {
		const data = await readJson<{ version?: number; regions?: Sound[] }>(
			`${video}.sounds.json`,
		);
		if (data?.version !== 1 || !Array.isArray(data.regions)) continue;
		for (const r of data.regions) {
			const source = path.join(path.dirname(video), path.basename(r.audioPath));
			if (!files.has(source)) {
				const copy = `${output}.sound-${files.size}.wav`;
				await fs.copyFile(source, copy);
				files.set(source, path.basename(copy));
			}
			regions.push({
				...r,
				id: shift ? `append-${r.id}` : r.id,
				startMs: r.startMs + shift,
				endMs: r.endMs + shift,
				audioPath: files.get(source)!,
			});
		}
	}
	if (regions.length)
		await fs.writeFile(`${output}.sounds.json`, JSON.stringify({ version: 1, regions }));
}

/**
 * Joins a newly recorded clip onto the end of an existing recording, with every sidecar
 * (microphone, computer audio, webcam, cursor, zooms, sounds) aligned to the joined timeline.
 * The inputs are left untouched.
 */
export async function appendRecordingClip(
	first: ClipSource,
	second: ClipSource,
	outputDir: string,
	now = Date.now(),
): Promise<AppendedRecording> {
	const [a, b] = await Promise.all([probe(first.videoPath), probe(second.videoPath)]);
	const ext = canCopyConcat(a, b) ? path.extname(first.videoPath) || ".mp4" : ".mp4";
	const output = path.join(outputDir, `recording-${now}${ext}`);
	const created: string[] = [];
	try {
		created.push(output);
		await concatScreen(first.videoPath, second.videoPath, a, b, output);
		const durations = [a.durationMs, b.durationMs];

		const metas = await Promise.all(
			[first.videoPath, second.videoPath].map(async (v) => {
				const meta = await readAudioMetadata(v);
				return meta ?? prepareRecordingAudio(v).catch(() => null);
			}),
		);
		let micPath: string | null = null;
		let systemAudioPath: string | null = null;
		const micFiles = await Promise.all(
			metas.map(async (m) => ((await exists(m?.micPath)) ? m!.micPath : null)),
		);
		if (micFiles.some(Boolean)) {
			micPath = `${recordingBase(output)}.mic.wav`;
			created.push(micPath);
			await concatAudio(
				micFiles.map((file, i) => ({
					file,
					offsetMs: metas[i]?.micOffsetMs ?? 0,
					durationMs: durations[i],
				})),
				"mono",
				micPath,
				["-c:a", "pcm_s16le"],
			);
		}
		const systemFiles = await Promise.all(
			metas.map(async (m) =>
				(await exists(m?.systemAudioPath)) ? m!.systemAudioPath : null,
			),
		);
		if (systemFiles.some(Boolean)) {
			systemAudioPath = `${recordingBase(output)}.system.m4a`;
			created.push(systemAudioPath);
			await concatAudio(
				systemFiles.map((file, i) => ({
					file,
					offsetMs: metas[i]?.systemOffsetMs ?? 0,
					durationMs: durations[i],
				})),
				"stereo",
				systemAudioPath,
				["-c:a", "aac", "-b:a", "192k"],
			);
		}
		if (micPath || systemAudioPath)
			await writeAudioMetadata({
				version: 1,
				videoPath: output,
				micPath,
				systemAudioPath,
				micOffsetMs: 0,
				systemOffsetMs: 0,
			});

		let webcamPath: string | null = null;
		const webcams = await Promise.all(
			[first, second].map(async (c) => ((await exists(c.webcamPath)) ? c.webcamPath! : null)),
		);
		if (webcams.some(Boolean)) {
			webcamPath = path.join(outputDir, `recording-${now}-webcam.mp4`);
			created.push(webcamPath);
			await concatWebcam(
				webcams.map((file, i) => ({
					file,
					offsetMs: [first, second][i].timeOffsetMs ?? 0,
					durationMs: durations[i],
				})),
				webcamPath,
			);
		}

		const cursor = joinCursorTelemetry(
			await readJson<{ samples?: Timed[] }>(getTelemetryPathForVideo(first.videoPath)),
			await readJson<{ samples?: Timed[] }>(getTelemetryPathForVideo(second.videoPath)),
			a.durationMs,
		);
		if (cursor) await fs.writeFile(getTelemetryPathForVideo(output), JSON.stringify(cursor));

		const zooms = await Promise.all(
			[first, second].map((c) =>
				readJson<{ version?: number; regions?: Region[] }>(`${c.videoPath}.zooms.json`),
			),
		);
		const zoomRegions = [
			...(zooms[0]?.version === 1 ? (zooms[0].regions ?? []) : []),
			...(zooms[1]?.version === 1
				? shiftRegions(zooms[1].regions ?? [], a.durationMs, "append-")
				: []),
		];
		if (zoomRegions.length)
			await fs.writeFile(
				`${output}.zooms.json`,
				JSON.stringify({ version: 1, regions: zoomRegions }),
			);
		await joinSounds(first.videoPath, second.videoPath, output, a.durationMs);

		return {
			videoPath: output,
			webcamPath,
			firstDurationMs: a.durationMs,
			secondDurationMs: b.durationMs,
		};
	} catch (error) {
		await Promise.all(created.map((f) => deleteRecordingArtifacts(f).catch(() => undefined)));
		throw error;
	}
}

/** Removes a recording and every sidecar written beside it (`<base>.*`). */
export async function deleteRecordingArtifacts(videoPath: string) {
	const dir = path.dirname(videoPath);
	const base = path.basename(recordingBase(videoPath));
	const names = await fs.readdir(dir).catch(() => [] as string[]);
	await Promise.all(
		names
			.filter((n) => n === path.basename(videoPath) || n.startsWith(`${base}.`))
			.map((n) => fs.rm(path.join(dir, n), { force: true })),
	);
}
