import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { type VoiceRecording, unwrapVoice } from "@/types/voice";
export function VoiceRecordingControls({ videoPath }: { videoPath: string | null }) {
	const t = useScopedT("settings");
	const [recording, setRecording] = useState<VoiceRecording | null>(null);
	const [error, setError] = useState("");
	useEffect(() => {
		if (!videoPath) return;
		let disposed = false;
		const load = () => {
			void window.electronAPI.voice
				.request("recording", videoPath)
				.then((r) => {
					if (!disposed) setRecording(unwrapVoice(r));
				})
				.catch(() => { if (!disposed) setError("operationFailed"); });
		};
		load();
		const stop = window.electronAPI.voice.onProgress((p) => {
			if (p.videoPath === videoPath) load();
		});
		return () => {
			disposed = true;
			stop();
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
