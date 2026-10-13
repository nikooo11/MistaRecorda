import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { type VoiceRecording, type VoiceProgress, unwrapVoice } from "@/types/voice";
import { useVoiceSettings } from "./useVoiceSettings";
export function VoiceRecordingControls({ videoPath }: { videoPath: string | null }) {
	const t = useScopedT("settings");
	const [recording, setRecording] = useState<VoiceRecording | null>(null);
	const [error, setError] = useState("");
	const [job, setJob] = useState<VoiceProgress | null>(null);
	const [starting, setStarting] = useState(false);
	const settings = useVoiceSettings();
	useEffect(() => {
		setRecording(null);
		setJob(null);
		setError("");
		if (!videoPath) return;
		let disposed = false;
		const load = () => {
			void window.electronAPI.voice
				.request("recording", videoPath)
				.then((r) => {
					if (!disposed) setRecording(unwrapVoice(r));
				})
				.catch(() => {
					if (!disposed) setError("operationFailed");
				});
		};
		load();
		void window.electronAPI.voice
			.request("progress", undefined)
			.then((r) => {
				if (!disposed)
					setJob(unwrapVoice(r).find((p) => p.videoPath === videoPath) ?? null);
			})
			.catch(() => {
				if (!disposed) setError("operationFailed");
			});
		const stop = window.electronAPI.voice.onProgress((p) => {
			if (p.videoPath === videoPath) {
				setJob(p);
				load();
			}
		});
		const stopAudio = window.electronAPI.voice.onAudioChanged((p) => {
			if (p === videoPath) load();
		});
		return () => {
			disposed = true;
			stop();
			stopAudio();
		};
	}, [videoPath]);
	if (!recording?.micPath) return null;
	return (
		<div className="flex items-center gap-3 px-3 py-1 text-xs">
			<button
				type="button"
				onClick={() => void window.electronAPI.voice.request("open", undefined)}
			>
				{t("voice.title")}
			</button>
			<span>
				{t("voice.selectedVoice")}:{" "}
				{settings?.voiceName || settings?.voiceId || t("voice.chooseVoice")}
			</span>
			<button
				type="button"
				disabled={starting || job?.state === "running"}
				onClick={() => {
					setStarting(true);
					setError("");
					void window.electronAPI.voice
						.request("start", recording.videoPath)
						.then(unwrapVoice)
						.catch((e) => setError(e.message))
						.finally(() => setStarting(false));
				}}
			>
				{t(recording.changedMicPath ? "voice.rerun" : "voice.process")}
			</button>
			{job?.state === "running" && (
				<>
					<span>
						{t("voice.progress", undefined, {
							completed: job.completed,
							total: job.total,
						})}
					</span>
					<button
						type="button"
						onClick={() => void window.electronAPI.voice.request("cancel", job.jobId)}
					>
						{t("voice.cancel")}
					</button>
				</>
			)}
			<label>
				{t("voice.micAudio")}{" "}
				<select
					className="bg-editor-bg"
					value={recording.micSelection ?? "original"}
					onChange={(e) => {
						const selection = e.target.value as "original" | "changed";
						void window.electronAPI.voice
							.request("selectMic", { videoPath: recording.videoPath, selection })
							.then((r) => {
								unwrapVoice(r);
								setRecording({ ...recording, micSelection: selection });
							})
							.catch(() => setError("operationFailed"));
					}}
				>
					<option value="original">{t("voice.original")}</option>
					<option value="changed" disabled={!recording.changedMicPath}>
						{t("voice.changed")}
					</option>
				</select>
			</label>
			{error && <span role="alert">{t(`voice.${error}`)}</span>}
		</div>
	);
}
