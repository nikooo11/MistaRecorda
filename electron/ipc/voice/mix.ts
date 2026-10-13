import type { RecordingAudioMetadata } from "../recording/library";
export function mixArgs(
	data: RecordingAudioMetadata,
	mic: string,
	output: string,
	duration: number,
) {
	const inputs = ["-i", data.videoPath, "-i", mic];
	if (data.systemAudioPath) inputs.push("-i", data.systemAudioPath);
	const delay = Math.max(0, Math.round(data.micOffsetMs));
	const filter = `[1:a]adelay=${delay}:all=1,apad[mic];${data.systemAudioPath ? "[2:a][mic]amix=inputs=2:normalize=0:duration=longest" : "[mic]anull"},atrim=duration=${duration}[out]`;
	return [
		...inputs,
		"-filter_complex",
		filter,
		"-map",
		"0:v:0",
		"-map",
		"[out]",
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
		output,
	];
}
