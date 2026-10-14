import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { type VoiceRecording, type VoiceProgress, unwrapVoice } from "@/types/voice";
import { useVoiceSettings } from "./useVoiceSettings";
export function VoiceRecordingControls({
	videoPath,
	variant = "bar",
	beforeProcess,
	processEnabled = true,
}: {
	videoPath: string | null;
	variant?: "bar" | "panel";
	beforeProcess?: () => Promise<void>;
	processEnabled?: boolean;
}) {
	const t = useScopedT("settings");
	const [recording, setRecording] = useState<VoiceRecording | null>(null);
	const [error, setError] = useState("");
	const [job, setJob] = useState<VoiceProgress | null>(null);
	const [starting, setStarting] = useState(false);
	const [loaded, setLoaded] = useState(false);
	const settings = useVoiceSettings();
	useEffect(() => {
		setRecording(null);
		setJob(null);
		setError("");
		setLoaded(false);
		if (!videoPath) return;
		let disposed = false;
		const load = () => {
			void window.electronAPI.voice
				.request("recording", videoPath)
				.then((r) => {
					if (!disposed) {
						setRecording(unwrapVoice(r));
						setLoaded(true);
					}
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
	if (!recording?.micPath)
		return variant === "panel" ? (
			<section className="voice-card voice-current-take">
				<h2>This recording</h2>
				<p>
					{!videoPath
						? "Open a recording to change its microphone voice."
						: error
							? t(`voice.${error}`, error)
							: !loaded
								? "Checking microphone audio…"
								: "This recording has no isolated microphone track. New microphone recordings keep one automatically for voice conversion."}
				</p>
			</section>
		) : null;
	return (
		<div
			className={
				variant === "panel"
					? "voice-card voice-current-take"
					: "flex flex-wrap items-center gap-3 px-3 py-1 text-xs"
			}
		>
			{variant === "panel" ? (
				<>
					<h2>This recording</h2>
					<p className="voice-recording-name">{videoPath?.split(/[\\/]/).pop()}</p>
					<p>
						Change only the microphone voice. Your original stays available; the editor
						and video export use the version you choose below.
					</p>
				</>
			) : (
				<button
					type="button"
					onClick={() => void window.electronAPI.voice.request("open", undefined)}
				>
					{t("voice.title")}
				</button>
			)}
			<span>
				{t("voice.selectedVoice")}:{" "}
				{settings?.voiceName || settings?.voiceId || t("voice.chooseVoice")}
			</span>
			<button
				type="button"
				className={variant === "panel" ? "voice-primary" : undefined}
				title="Send this recording’s isolated microphone track to ElevenLabs with the selected voice and tuning. The original is preserved."
				disabled={!processEnabled || starting || job?.state === "running"}
				onClick={() => {
					setStarting(true);
					setError("");
					void Promise.resolve()
						.then(async () => {
							await beforeProcess?.();
							unwrapVoice(
								await window.electronAPI.voice.request(
									"start",
									recording.videoPath,
								),
							);
						})
						.catch((e) => setError(e.message))
						.finally(() => setStarting(false));
				}}
			>
				{starting
					? "Starting…"
					: variant === "panel"
						? recording.changedMicPath
							? "Change voice again"
							: "Change this recording’s voice"
						: t(recording.changedMicPath ? "voice.rerun" : "voice.process")}
			</button>
			{variant === "panel" && !processEnabled && (
				<p>Choose a voice, connect your key, and allow microphone processing below.</p>
			)}
			{job?.state === "running" && (
				<>
					<span>
						{t("voice.progress", undefined, {
							completed: job.completed,
							total: job.total,
						})}
					</span>
					<progress
						aria-label="Voice conversion progress"
						max={job.total || 1}
						value={job.completed}
					/>
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
			{job?.state === "error" && (
				<span role="alert">{t(`voice.${job.error ?? "operationFailed"}`, job.error)}</span>
			)}
			{error && <span role="alert">{t(`voice.${error}`, error)}</span>}
		</div>
	);
}
