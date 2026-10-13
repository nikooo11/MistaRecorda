import { useEffect, useState } from "react";
import { unwrapVoice, type VoiceSettings } from "@/types/voice";

export function useVoiceSettings() {
	const [settings, setSettings] = useState<(VoiceSettings & { hasKey: boolean }) | null>(null);
	useEffect(() => {
		let disposed = false;
		const load = () => {
			void window.electronAPI.voice
				.request("getSettings", undefined)
				.then((result) => {
					if (!disposed) setSettings(unwrapVoice(result));
				})
				.catch(() => {
					if (!disposed) setSettings(null);
				});
		};
		load();
		const unsubscribe = window.electronAPI.voice.onSettingsChanged(load);
		return () => {
			disposed = true;
			unsubscribe();
		};
	}, []);
	return settings;
}
