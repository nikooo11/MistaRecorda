import { app, dialog, nativeImage } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { SceneMediaSource } from "../../src/types/studio";
import type { AudioRegion } from "../../src/components/video-editor/types";
import { getFfprobeBinaryPath } from "../ipc/ffmpeg/binary";
import { ffmpeg } from "../ipc/voice/chunker";
import { sceneMediaSchema } from "./model";

const root = () => path.join(app.getPath("userData"), "studio", "media");
const extensions = {
	image: ["png", "jpg", "jpeg", "gif", "webp"],
	video: ["mp4", "mov", "webm", "mkv"],
	audio: ["mp3", "wav", "m4a", "aac", "flac", "ogg"],
};
export async function sceneMediaPath(source: SceneMediaSource) {
	const safe = sceneMediaSchema.parse(source);
	const file = path.join(root(), safe.file);
	const stat = await fs.lstat(file);
	if (!stat.isFile() || stat.isSymbolicLink())
		throw Error(`Import ${safe.name} again; its media file is missing.`);
	return file;
}
export async function importSceneMedia(
	kind: SceneMediaSource["kind"],
): Promise<SceneMediaSource | null> {
	const result = await dialog.showOpenDialog({
		title: `Add ${kind} to scene`,
		properties: ["openFile"],
		filters: [{ name: kind, extensions: extensions[kind] }],
	});
	if (result.canceled || !result.filePaths[0]) return null;
	const original = result.filePaths[0];
	const stat = await fs.stat(original);
	if (!stat.isFile() || stat.size > (kind === "image" ? 25 : 500) * 1024 * 1024)
		throw Error(
			kind === "image" ? "Choose an image under 25 MB." : "Choose media under 500 MB.",
		);
	const id = crypto.randomUUID();
	const ext = path.extname(original).toLowerCase().slice(1);
	if (!extensions[kind].includes(ext)) throw Error("Choose a supported media file.");
	const file = `${id}.${kind === "image" ? ext : kind === "video" ? "mp4" : "m4a"}`;
	let durationMs: number | undefined;
	let hasAudio = false;
	let ratio = 16 / 9;
	await fs.mkdir(root(), { recursive: true });
	const target = path.join(root(), file);
	try {
		if (kind === "image") {
			const image = nativeImage.createFromPath(original);
			if (image.isEmpty()) throw Error("This image cannot be opened.");
			const size = image.getSize();
			ratio = size.width / size.height;
			await fs.copyFile(original, target);
		} else {
			const { stdout } = await promisify(execFile)(
				getFfprobeBinaryPath(),
				["-v", "error", "-show_format", "-show_streams", "-of", "json", original],
				{ timeout: 30000 },
			);
			const probe = JSON.parse(stdout);
			durationMs = Number(probe.format?.duration) * 1000;
			if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 3600000)
				throw Error("Choose a clip shorter than one hour.");
			hasAudio =
				probe.streams?.some((s: { codec_type: string }) => s.codec_type === "audio") ??
				false;
			const video = probe.streams?.find(
				(s: { codec_type: string }) => s.codec_type === "video",
			);
			if ((kind === "audio" && !hasAudio) || (kind === "video" && !video))
				throw Error(`This file has no ${kind} track.`);
			if (video) ratio = video.width / video.height;
			await ffmpeg([
				"-i",
				original,
				...(kind === "audio"
					? ["-vn"]
					: [
							"-map",
							"0:v:0",
							"-map",
							"0:a?",
							"-c:v",
							"libx264",
							"-preset",
							"veryfast",
							"-crf",
							"20",
							"-vf",
							"scale=trunc(iw/2)*2:trunc(ih/2)*2",
							"-pix_fmt",
							"yuv420p",
						]),
				"-c:a",
				"aac",
				"-b:a",
				"192k",
				"-movflags",
				"+faststart",
				target,
			]);
		}
		const width = kind === "image" ? 0.3 : 0.6;
		const height = Math.min(0.8, Math.max(0.05, (width * (16 / 9)) / ratio));
		return sceneMediaSchema.parse({
			id,
			file,
			kind,
			name: path.basename(original, path.extname(original)).slice(0, 100),
			enabled: true,
			x: 0.04,
			y: 0.08,
			width,
			height,
			opacity: 1,
			volume: kind === "audio" ? 0.2 : 1,
			loop: kind === "audio",
			durationMs,
			hasAudio,
		});
	} catch (e) {
		await fs.rm(target, { force: true });
		throw e;
	}
}

/** Use recorder time, so pauses do not introduce gaps or advance media. */
export class SceneMediaTake {
	segments: { source: SceneMediaSource; startMs: number; endMs: number }[] = [];
	private current: SceneMediaSource[] = [];
	private startMs = 0;
	start(sources: SceneMediaSource[]) {
		this.segments = [];
		this.current = structuredClone(sources);
		this.startMs = 0;
	}
	switch(sources: SceneMediaSource[], timeMs: number) {
		for (const source of this.current) {
			if (!source.enabled || !source.hasAudio || source.volume === 0) continue;
			const endMs = source.loop
				? timeMs
				: Math.min(timeMs, this.startMs + (source.durationMs ?? 0));
			if (endMs > this.startMs) this.segments.push({ source, startMs: this.startMs, endMs });
		}
		this.current = structuredClone(sources);
		this.startMs = timeMs;
	}
	async renderAudio(
		videoPath: string,
		onError?: (name: string, error: unknown) => void,
	): Promise<AudioRegion[]> {
		const regions: AudioRegion[] = [];
		for (const [index, segment] of this.segments.entries()) {
			const audioPath = `${videoPath}.scene-${index}-${crypto.randomUUID()}.wav`;
			try {
				await ffmpeg([
					...(segment.source.loop ? ["-stream_loop", "-1"] : []),
					"-i",
					await sceneMediaPath(segment.source),
					"-vn",
					"-af",
					`aresample=48000,asetpts=N/SR/TB,apad,atrim=duration=${(segment.endMs - segment.startMs) / 1000}`,
					"-t",
					String((segment.endMs - segment.startMs) / 1000),
					"-ar",
					"48000",
					"-ac",
					"2",
					"-c:a",
					"pcm_s16le",
					audioPath,
				]);
				regions.push({
					id: `scene-${crypto.randomUUID()}`,
					startMs: Math.round(segment.startMs),
					endMs: Math.round(segment.endMs),
					audioPath,
					volume: segment.source.volume,
					normalize: false,
					trackIndex: 0,
				});
			} catch (error) {
				await fs.rm(audioPath, { force: true });
				if (!onError) throw error;
				onError(segment.source.name, error);
			}
		}
		return regions;
	}
}
