import fs from "node:fs/promises";
import path from "node:path";
import type { AudioRegion } from "../../src/components/video-editor/types";
import {
	audioMetadataPath,
	prepareRecordingAudio,
	recordingBase,
	writeAudioMetadata,
} from "../ipc/recording/library";
import { audioDuration, ffmpeg } from "../ipc/voice/chunker";

/** Monitor audio is excluded at capture. Mix each trigger exactly once, preserving the isolated mic. */
export async function bakeSounds(
	videoPath: string,
	regions: AudioRegion[],
	editableRegions: AudioRegion[] = [],
) {
	if (!regions.length) return;
	const meta = await prepareRecordingAudio(videoPath);
	const duration = await audioDuration(videoPath);
	const temp = await fs.mkdtemp(path.join(path.dirname(videoPath), ".sound-mix-"));
	try {
		const inputs: string[] = [];
		const filters: string[] = [];
		const labels: string[] = [];
		let i = 0;
		if (meta.systemAudioPath) {
			inputs.push("-i", meta.systemAudioPath);
			filters.push(
				`[${i}:a]asetpts=PTS-STARTPTS,adelay=${Math.round(meta.systemOffsetMs ?? 0)}:all=1[s${i}]`,
			);
			labels.push(`[s${i++}]`);
		}
		for (const region of regions) {
			inputs.push("-i", region.audioPath);
			filters.push(
				`[${i}:a]asetpts=PTS-STARTPTS,volume=${region.volume},adelay=${region.startMs}:all=1[s${i}]`,
			);
			labels.push(`[s${i++}]`);
		}
		filters.push(
			`${labels.join("")}amix=inputs=${labels.length}:normalize=0,apad,atrim=duration=${duration}[out]`,
		);
		const system = path.join(temp, "system.m4a");
		await ffmpeg([
			...inputs,
			"-filter_complex",
			filters.join(";"),
			"-map",
			"[out]",
			"-ar",
			"48000",
			"-ac",
			"2",
			"-c:a",
			"aac",
			"-b:a",
			"192k",
			system,
		]);
		const video = path.join(temp, "video.mp4");
		await ffmpeg([
			"-i",
			videoPath,
			"-i",
			system,
			...(meta.micPath
				? [
						"-i",
						meta.micPath,
						"-filter_complex",
						`[2:a]adelay=${meta.micOffsetMs}:all=1[m];[1:a][m]amix=inputs=2:normalize=0,apad,atrim=duration=${duration}[out]`,
					]
				: []),
			"-map",
			"0:v:0",
			"-map",
			meta.micPath ? "[out]" : "1:a:0",
			"-c:v",
			"copy",
			"-c:a",
			"aac",
			"-b:a",
			"192k",
			"-t",
			String(duration),
			"-movflags",
			"+faststart",
			video,
		]);
		const target = `${recordingBase(videoPath)}.system.m4a`;
		// Keep rollback copies until video, track, metadata and cue manifest agree.
		const destinations = [
			videoPath,
			target,
			`${target}.json`,
			audioMetadataPath(videoPath),
			`${videoPath}.sounds.json`,
		];
		const backups: { target: string; backup: string; exists: boolean }[] = [];
		for (const [i, destination] of destinations.entries()) {
			const backup = path.join(temp, `backup-${i}`);
			const exists = await fs
				.stat(destination)
				.then(() => true)
				.catch(() => false);
			if (exists) await fs.copyFile(destination, backup);
			backups.push({ target: destination, backup, exists });
		}
		try {
			await fs.rename(video, videoPath);
			await fs.rename(system, target);
			await fs.writeFile(`${target}.json`, JSON.stringify({ startDelayMs: 0 }));
			await writeAudioMetadata({ ...meta, systemAudioPath: target, systemOffsetMs: 0 });
			await fs.writeFile(
				`${videoPath}.sounds.json`,
				JSON.stringify({
					version: 1,
					regions: editableRegions,
					includedInRecording: editableRegions.length === 0,
				}),
			);
		} catch (error) {
			for (const backup of backups) {
				if (backup.exists) await fs.copyFile(backup.backup, backup.target);
				else await fs.rm(backup.target, { force: true });
			}
			throw error;
		}
	} finally {
		await fs.rm(temp, { recursive: true, force: true });
	}
}
