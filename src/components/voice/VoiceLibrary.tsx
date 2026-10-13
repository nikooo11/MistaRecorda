import { useCallback, useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { unwrapVoice, type VoiceProgress, type VoiceRecording } from "@/types/voice";
import { useVoiceSettings } from "./useVoiceSettings";
export function VoiceLibrary() {
	const t = useScopedT("settings");
	const settings = useVoiceSettings();
	const [records, setRecords] = useState<VoiceRecording[]>([]);
	const [jobs, setJobs] = useState<VoiceProgress[]>([]);
	const [error, setError] = useState("");
	const load = useCallback(() => {
		void window.electronAPI.voice
			.request("recordings", undefined)
			.then((r) => setRecords(unwrapVoice(r)))
			.catch(() => setError("operationFailed"));
	}, []);
	useEffect(() => {
		load();
		void window.electronAPI.voice
			.request("progress", undefined)
			.then((r) => setJobs(unwrapVoice(r)))
			.catch(() => setError("operationFailed"));
		const stopProgress = window.electronAPI.voice.onProgress((p) => {
			setJobs((previous) => [...previous.filter((j) => j.videoPath !== p.videoPath), p]);
			if (p.state !== "running") load();
		});
		const stopAudio = window.electronAPI.voice.onAudioChanged(load);
		return () => {
			stopProgress();
			stopAudio();
		};
	}, [load]);
	return (
		<section className="border-t pt-4 space-y-3">
			<h2>{t("voice.recordings")}</h2>
			<p>
				{t("voice.selectedVoice")}:{" "}
				{settings?.voiceName || settings?.voiceId || t("voice.chooseVoice")}
			</p>
			<button type="button" onClick={load}>
				{t("voice.refresh")}
			</button>
			{records.length === 0 && <p>{t("voice.noRecordings")}</p>}
			{records.map((r) => {
				const job = jobs.find((j) => j.videoPath === r.videoPath);
				return (
					<article key={r.videoPath} className="border rounded p-3 space-x-3">
						<span>{r.videoPath.split(/[\\/]/).pop()}</span>
						{r.changedMicPath && <span>{t("voice.changedBadge")}</span>}
						<button
							type="button"
							disabled={!r.micPath || job?.state === "running"}
							onClick={() => {
								void window.electronAPI.voice
									.request("start", r.videoPath)
									.then(unwrapVoice)
									.catch((e) => setError(e.message));
							}}
						>
							{t(r.changedMicPath ? "voice.rerun" : "voice.process")}
						</button>
						{job?.state === "running" && (
							<>
								<span>
									{t("voice.progress", undefined, {
										completed: job.completed,
										total: job.total,
									})}
								</span>
								<progress max={job.total || 1} value={job.completed} />
								<button
									type="button"
									onClick={() =>
										void window.electronAPI.voice.request("cancel", job.jobId)
									}
								>
									{t("voice.cancel")}
								</button>
							</>
						)}
						{job?.state === "error" && (
							<span role="alert">{t(`voice.${job.error ?? "operationFailed"}`)}</span>
						)}
						{r.voiceVideoPath && (
							<>
								<button
									type="button"
									onClick={() =>
										void window.electronAPI.voice.request("outputAction", {
											videoPath: r.videoPath,
											action: "open",
										})
									}
								>
									{t("voice.open")}
								</button>
								<button
									type="button"
									onClick={() =>
										void window.electronAPI.voice.request("outputAction", {
											videoPath: r.videoPath,
											action: "reveal",
										})
									}
								>
									{t("voice.reveal")}
								</button>
							</>
						)}
					</article>
				);
			})}
			{error && <p role="alert">{t(`voice.${error}`)}</p>}
		</section>
	);
}
