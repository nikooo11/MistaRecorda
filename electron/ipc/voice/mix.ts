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
	const systemDelay = Math.max(0, Math.round(data.systemOffsetMs ?? 0));
	const system = systemDelay ? "[system]" : "[2:a]";
	const filter = `${data.systemAudioPath && systemDelay ? `[2:a]adelay=${systemDelay}:all=1[system];` : ""}[1:a]adelay=${delay}:all=1,apad[mic];${data.systemAudioPath ? `${system}[mic]amix=inputs=2:normalize=0:duration=longest` : "[mic]anull"},atrim=duration=${duration}[out]`;
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
