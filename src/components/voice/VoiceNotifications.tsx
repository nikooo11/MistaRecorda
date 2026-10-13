import { useEffect } from "react";
import { toast } from "sonner";
import { useScopedT } from "@/contexts/I18nContext";
import { type VoiceProgress, unwrapVoice } from "@/types/voice";
export function VoiceNotifications() {
	const t = useScopedT("settings");
	useEffect(() => {
		const show = (p: VoiceProgress) => {
			if (p.state === "running") return;
			if (p.state === "done")
				toast.success(t("voice.done"), {
					id: p.jobId,
					action: {
						label: t("voice.open"),
						onClick: () => {
							void window.electronAPI.voice.request("outputAction", {
								videoPath: p.videoPath,
								action: "open",
							});
						},
					},
					cancel: {
						label: t("voice.reveal"),
						onClick: () => {
							void window.electronAPI.voice.request("outputAction", {
								videoPath: p.videoPath,
								action: "reveal",
							});
						},
					},
				});
			else if (p.state === "error")
				toast.error(t(`voice.${p.error ?? "operationFailed"}`), {
					id: p.jobId,
					action: {
						label: t("voice.retry"),
						onClick: () => {
							void window.electronAPI.voice
								.request("start", p.videoPath)
								.then(unwrapVoice)
								.catch(() => toast.error(t("voice.operationFailed")));
						},
					},
				});
		};
		return window.electronAPI.voice.onProgress(show);
	}, [t]);
	return null;
}
