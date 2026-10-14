import { useEffect, useState } from "react";
import { unwrapVoice, type VoiceInfo } from "@/types/voice";
import type { VoicePreset } from "@/types/voicePreset";
import { voiceProcessingKey } from "@/lib/voiceExport";
import { useScopedT } from "@/contexts/I18nContext";
import type { VoiceExportState } from "./useVoiceExport";
import { VoicePreviewButton } from "./VoicePreviewButton";
import { modelLabel } from "./voiceModels";

export function VoiceExportControls({
	state,
	onManage,
}: {
	state: VoiceExportState;
	onManage: () => void;
}) {
	const { settings, recording, enabled, processing, busy, job, run } = state;
	const t = useScopedT("settings");
	const [voices, setVoices] = useState<VoiceInfo[]>([]);
	const [presets, setPresets] = useState<VoicePreset[]>([]);
	const [favorites, setFavorites] = useState<string[]>([]);
	const [listError, setListError] = useState("");
	useEffect(() => {
		let disposed = false;
		const load = async () => {
			try {
				if (!disposed) setListError("");
				const [p, f] = await Promise.all([
					window.electronAPI.voice.request("presets", undefined),
					window.electronAPI.voice.request("favorites", undefined),
				]);
				if (!disposed) {
					setPresets([
						...new Map(unwrapVoice(p).map((e) => [e.preset.id, e.preset])).values(),
					]);
					setFavorites(unwrapVoice(f));
				}
				if (settings?.hasKey) {
					const v = unwrapVoice(
						await window.electronAPI.voice.request("listVoices", undefined),
					);
					if (!disposed) setVoices(v);
				}
			} catch (e) {
				if (!disposed)
					setListError(e instanceof Error ? e.message : "Could not load voices");
			}
		};
		void load();
		const off = window.electronAPI.voice.onPresetsChanged(() => void load());
		return () => {
			disposed = true;
			off();
		};
	}, [settings?.hasKey]);
	const selectedPreset = settings
		? presets.find(
				(p) =>
					p.voice.voiceId === settings.voiceId &&
					p.name === settings.voiceName &&
					voiceProcessingKey({ ...settings, ...p.settings }) ===
						voiceProcessingKey(settings),
			)
		: undefined;
	const value = selectedPreset
		? `preset:${selectedPreset.id}`
		: settings?.voiceId
			? `voice:${settings.voiceId}`
			: "";
	const selectedVoice = voices.find((v) => v.voiceId === settings?.voiceId);
	const starred = selectedPreset
		? selectedPreset.isFavorite
		: favorites.includes(settings?.voiceId ?? "");
	const choices = [...voices].sort(
		(a, b) =>
			Number(favorites.includes(b.voiceId)) - Number(favorites.includes(a.voiceId)) ||
			a.name.localeCompare(b.name),
	);
	const preview = selectedPreset?.preview.base64
		? `data:audio/${selectedPreset.preview.format};base64,${selectedPreset.preview.base64}`
		: selectedVoice?.previewUrl;
	return (
		<section
			aria-label="Export voice"
			className="mt-2 border-t border-foreground/10 pt-2 text-xs"
		>
			<label className="flex items-center gap-2">
				<input
					type="checkbox"
					checked={enabled}
					disabled={!recording?.micPath || busy || processing}
					onChange={(e) => void state.toggle(e.target.checked)}
				/>
				Change microphone voice
			</label>
			{!recording?.micPath ? (
				<p className="mt-1 text-muted-foreground">
					{state.loaded
						? "No isolated microphone audio in this recording."
						: "Checking microphone audio…"}
				</p>
			) : (
				<>
					<div className="mt-2 flex items-center gap-1">
						<select
							aria-label="Export voice selection"
							value={value}
							disabled={busy || processing}
							className="min-w-0 flex-1 rounded border border-foreground/20 bg-editor-surface px-2 py-1.5"
							onChange={(e) =>
								void run(async () => {
									if (e.target.value.startsWith("preset:")) {
										const p = presets.find(
											(p) => `preset:${p.id}` === e.target.value,
										);
										if (p)
											unwrapVoice(
												await window.electronAPI.voice.request(
													"usePreset",
													p,
												),
											);
									} else {
										const v = voices.find(
											(v) => `voice:${v.voiceId}` === e.target.value,
										);
										if (v)
											unwrapVoice(
												await window.electronAPI.voice.request(
													"chooseVoice",
													{
														voiceId: v.voiceId,
														name: v.name,
														publicOwnerId: v.publicOwnerId,
													},
												),
											);
									}
								})
							}
						>
							<option value="">Choose a voice</option>
							{settings?.voiceId && !selectedVoice && !selectedPreset && (
								<option value={value}>
									{settings.voiceName || settings.voiceId}
								</option>
							)}
							{presets.length > 0 && (
								<optgroup label="Team & saved presets">
									{[...presets]
										.sort(
											(a, b) =>
												Number(b.isFavorite) - Number(a.isFavorite) ||
												a.name.localeCompare(b.name),
										)
										.map((p) => (
											<option key={p.id} value={`preset:${p.id}`}>
												{p.isFavorite ? "★ " : ""}
												{p.name} · {modelLabel(p.settings.modelId)}
											</option>
										))}
								</optgroup>
							)}
							<optgroup label="My voices">
								{choices.map((v) => (
									<option key={v.voiceId} value={`voice:${v.voiceId}`}>
										{favorites.includes(v.voiceId) ? "★ " : ""}
										{v.name}
									</option>
								))}
							</optgroup>
						</select>
						<VoicePreviewButton
							src={preview ?? null}
							name={settings?.voiceName || "Selected voice"}
							onError={setListError}
						/>
						<button
							type="button"
							aria-label={
								starred ? "Unfavorite export voice" : "Favorite export voice"
							}
							aria-pressed={starred}
							disabled={!settings?.voiceId || busy || processing}
							className="p-1.5"
							onClick={() =>
								void run(async () => {
									if (selectedPreset)
										unwrapVoice(
											await window.electronAPI.voice.request("savePreset", {
												...selectedPreset,
												isFavorite: !starred,
											}),
										);
									else if (settings)
										unwrapVoice(
											await window.electronAPI.voice.request("favorite", {
												voiceId: settings.voiceId,
												name: settings.voiceName,
												enabled: !starred,
											}),
										);
								})
							}
						>
							{starred ? "★" : "☆"}
						</button>
					</div>
					<div className="mt-1 flex justify-between gap-2 text-[11px] text-muted-foreground">
						<span>
							{settings?.modelId ? modelLabel(settings.modelId) : "ElevenLabs"}
						</span>
						<button type="button" onClick={onManage}>
							Voices / import presets…
						</button>
					</div>
					{enabled && (
						<>
							{!settings?.hasKey ? (
								<button type="button" onClick={onManage} className="mt-2 underline">
									Connect ElevenLabs
								</button>
							) : !settings.noticeAccepted ? (
								<label className="mt-2 flex gap-2">
									<input
										type="checkbox"
										onChange={(e) =>
											void run(async () => {
												unwrapVoice(
													await window.electronAPI.voice.request(
														"saveSettings",
														{
															...settings,
															noticeAccepted: e.target.checked,
														},
													),
												);
											})
										}
									/>
									Allow sending this recording’s microphone audio to ElevenLabs.
								</label>
							) : null}
							<button
								type="button"
								disabled={
									busy ||
									processing ||
									!settings?.voiceId ||
									!settings.hasKey ||
									!settings.noticeAccepted ||
									state.ready
								}
								onClick={() => void state.process()}
								className="mt-2 w-full rounded border border-foreground/20 px-2 py-1.5 font-medium disabled:opacity-50"
								title="Send only the microphone audio to ElevenLabs. The original is preserved. Uses conversion credits."
							>
								{processing
									? `Processing voice · ${job?.completed}/${job?.total || "…"}`
									: state.ready
										? "Voice ready for export"
										: "Process voice via ElevenLabs"}
							</button>
							{processing && (
								<button
									type="button"
									className="mt-1 text-muted-foreground"
									onClick={() =>
										void run(async () => {
											if (job)
												unwrapVoice(
													await window.electronAPI.voice.request(
														"cancel",
														job.jobId,
													),
												);
										})
									}
								>
									Cancel voice processing
								</button>
							)}
							<p role="status" className="mt-1 text-[11px] text-muted-foreground">
								{state.ready
									? `Ready: ${recording?.changedVoiceName || settings?.voiceName}. Export uses this voice.`
									: "Export unlocks after the selected voice and settings are processed."}
							</p>
						</>
					)}
				</>
			)}
			{(state.error || listError || job?.state === "error") && (
				<p role="alert" className="mt-1 text-red-500">
					{t(
						`voice.${state.error || listError || job?.error}`,
						state.error || listError || job?.error,
					)}
				</p>
			)}
		</section>
	);
}
