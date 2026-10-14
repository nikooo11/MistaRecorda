import { useEffect, useState } from "react";
import { unwrapVoice, type VoiceRecording, type VoiceProgress } from "@/types/voice";
export function useVoiceRecording(videoPath: string | null) {
	const [recording, setRecording] = useState<VoiceRecording | null>(null);
	const [job, setJob] = useState<VoiceProgress | null>(null);
	const [error, setError] = useState("");
	const [loaded, setLoaded] = useState(false);
	useEffect(() => {
		setRecording(null);
		setJob(null);
		setError("");
		setLoaded(false);
		if (!videoPath) return;
		let disposed = false;
		const load = async () => {
			try {
				const next = unwrapVoice(
					await window.electronAPI.voice.request("recording", videoPath),
				);
				if (!disposed) {
					setRecording(next);
					setError("");
					setLoaded(true);
				}
			} catch (e) {
				if (!disposed) setError(e instanceof Error ? e.message : "operationFailed");
			}
		};
		void load();
		void window.electronAPI.voice
			.request("progress", undefined)
			.then((r) => {
				if (!disposed)
					setJob(unwrapVoice(r).find((p) => p.videoPath === videoPath) ?? null);
			})
			.catch(() => {
				if (!disposed) setError("operationFailed");
			});
		const off = window.electronAPI.voice.onProgress((p) => {
			if (p.videoPath === videoPath) {
				setJob(p);
				if (p.state !== "running") void load();
			}
		});
		const offAudio = window.electronAPI.voice.onAudioChanged((p) => {
			if (p === videoPath) void load();
		});
		return () => {
			disposed = true;
			off();
			offAudio();
		};
	}, [videoPath]);
	return { recording, job, error, loaded };
}
