import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { unwrapVoice } from "@/types/voice";
import type { VoicePreset } from "@/types/voicePreset";
export function QuickVoicePreset() {
	const t = useScopedT("settings");
	const [presets, setPresets] = useState<VoicePreset[]>([]);
	const [selected, setSelected] = useState("");
	const [error, setError] = useState("");
	useEffect(() => {
		const load = () => {
			void window.electronAPI.voice
				.request("presets", undefined)
				.then((r) => {
					const all = unwrapVoice(r).map((x) => x.preset);
					setPresets(
						[...new Map(all.map((p) => [p.id, p])).values()].sort(
							(a, b) =>
								Number(b.isFavorite) - Number(a.isFavorite) ||
								a.name.localeCompare(b.name),
						),
					);
				})
				.catch(() => setError("operationFailed"));
		};
		load();
		return window.electronAPI.voice.onPresetsChanged(load);
	}, []);
	return (
		<label title={error ? t(`voice.${error}`) : t("voice.quickPreset")}>
			<select
				aria-label={t("voice.quickPreset")}
				className="bg-editor-bg text-xs max-w-32"
				value={selected}
				onChange={(e) => {
					const p = presets.find((p) => p.id === e.target.value);
					if (!p) return;
					void window.electronAPI.voice
						.request("usePreset", p)
						.then((r) => {
							unwrapVoice(r);
							setSelected(p.id);
							setError("");
						})
						.catch((e) => setError(e.message));
				}}
			>
				<option value="">{t("voice.quickPreset")}</option>
				{presets.map((p) => (
					<option value={p.id} key={p.id}>
						{p.isFavorite ? "★ " : ""}
						{p.name}
					</option>
				))}
			</select>
		</label>
	);
}
