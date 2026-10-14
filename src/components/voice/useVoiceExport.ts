import { useEffect, useRef, useState } from "react";
import { unwrapVoice } from "@/types/voice";
import { isVoiceExportReady, voiceChangeEnabled } from "@/lib/voiceExport";
import { useVoiceRecording } from "./useVoiceRecording";
import { useVoiceSettings } from "./useVoiceSettings";

export function useVoiceExport(videoPath: string | null) {
	const settings = useVoiceSettings();
	const { recording, job, loaded, error: loadError } = useVoiceRecording(videoPath);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const lock = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Clear operation errors when the user opens another recording.
	useEffect(() => {
		setError("");
	}, [videoPath]);
	const run = async (action: () => Promise<void>) => {
		if (lock.current) return;
		lock.current = true;
		setBusy(true);
		setError("");
		try {
			await action();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Operation failed");
		} finally {
			lock.current = false;
			setBusy(false);
		}
	};
	const enabled = voiceChangeEnabled(recording);
	const processing = job?.state === "running";
	const ready =
		loaded && !loadError && !busy && !processing && isVoiceExportReady(recording, settings);
	const toggle = (enabled: boolean) =>
		run(async () => {
			if (videoPath)
				unwrapVoice(
					await window.electronAPI.voice.request("setVoiceChange", {
						videoPath,
						enabled,
					}),
				);
		});
	const process = () =>
		run(async () => {
			if (!videoPath || !settings) return;
			unwrapVoice(
				await window.electronAPI.voice.request("setVoiceChange", {
					videoPath,
					enabled: true,
				}),
			);
			unwrapVoice(await window.electronAPI.voice.request("start", { videoPath, settings }));
		});
	return {
		settings,
		recording,
		job,
		loaded,
		enabled,
		processing,
		busy,
		ready,
		error: error || loadError,
		run,
		toggle,
		process,
	};
}
export type VoiceExportState = ReturnType<typeof useVoiceExport>;
