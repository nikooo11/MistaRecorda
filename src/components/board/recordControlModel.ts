import type { BoardStatus } from "../../types/board";
export type RecordIntent = "start" | "stop" | "pause" | "resume";
export type RecordingCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export const idleRecording: BoardStatus = {
	recording: false,
	paused: false,
	elapsed: 0,
	webcam: false,
};
export function recordIntent(status: BoardStatus): RecordIntent {
	return status.recording ? "stop" : "start";
}
export function pauseIntent(status: BoardStatus): RecordIntent | undefined {
	return status.recording ? (status.paused ? "resume" : "pause") : undefined;
}
export function intentAllowed(status: BoardStatus, intent: RecordIntent) {
	return intent === "start"
		? !status.recording
		: intent === "stop"
			? status.recording
			: intent === "pause"
				? status.recording && !status.paused
				: status.recording && status.paused;
}
export function needsStopConfirmation(status: BoardStatus, enabled: boolean) {
	return enabled && status.recording && status.elapsed >= 5;
}
export function recordingTime(seconds: number) {
	const s = Math.max(0, Math.floor(seconds));
	return `${Math.floor(s / 60)
		.toString()
		.padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
export function recordingCorner(value: unknown): RecordingCorner {
	return ["top-left", "top-right", "bottom-left", "bottom-right"].includes(String(value))
		? (value as RecordingCorner)
		: "bottom-right";
}
