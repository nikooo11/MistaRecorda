import { CaretDownIcon, DeviceTabletIcon, KeyIcon, WaveformIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useScopedT } from "@/contexts/I18nContext";
import {
	defaultVoiceSettings,
	unwrapVoice,
	type VoiceInfo,
	type VoiceModel,
	type VoiceSettings,
} from "@/types/voice";
import type { VoicePreset } from "@/types/voicePreset";
import { useVoiceRecording } from "./useVoiceRecording";
import { VoiceBrowser } from "./VoiceBrowser";
import { VoiceCostEstimate } from "./VoiceCostEstimate";
import { VoiceCueEditor } from "./VoiceCueEditor";
import { fallbackVoiceModels, modelLabel } from "./voiceModels";
import "./voice.css";

export function VoicePanel({
	embedded = false,
	videoPath = null,
	onSeek,
}: {
	embedded?: boolean;
	videoPath?: string | null;
	onSeek?: (timeMs: number) => void;
} = {}) {
	const t = useScopedT("settings");
	const request = window.electronAPI.voice.request;
	const [settings, setSettings] = useState<VoiceSettings>(defaultVoiceSettings);
	const [hasKey, setHasKey] = useState(false);
	const [key, setKey] = useState("");
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const busyRef = useRef(false);
	const [applyingId, setApplyingId] = useState("");
	const [connect, setConnect] = useState(false);
	const [expanded, setExpanded] = useState(true);
	const [models, setModels] = useState<VoiceModel[]>(fallbackVoiceModels);
	const [modelNotice, setModelNotice] = useState("Connect to load live voice-conversion models.");
	const [modelRevision, setModelRevision] = useState(0);
	const [loadingModels, setLoadingModels] = useState(false);
	const { recording, job, loaded, error } = useVoiceRecording(videoPath);
	const processing = busy || job?.state === "running";
	const selectedVoiceId = settings.voiceId;
	const run = async (action: () => Promise<void>) => {
		if (busyRef.current) return;
		busyRef.current = true;
		setBusy(true);
		setMessage("");
		try {
			await action();
		} catch (e) {
			setMessage(e instanceof Error ? e.message : "operationFailed");
		} finally {
			busyRef.current = false;
			setBusy(false);
			setApplyingId("");
		}
	};
	useEffect(() => {
		let disposed = false;
		const load = () =>
			void request("getSettings", undefined)
				.then((r) => {
					if (!disposed) {
						const next = unwrapVoice(r);
						setSettings(next);
						setHasKey(next.hasKey);
					}
				})
				.catch(() => {
					if (!disposed) setMessage("operationFailed");
				});
		load();
		const off = window.electronAPI.voice.onSettingsChanged(load);
		return () => {
			disposed = true;
			off();
		};
	}, [request]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Refresh explicitly re-fetches the live provider model list.
	useEffect(() => {
		if (!hasKey) {
			setModels(fallbackVoiceModels);
			setModelNotice("Connect to load live voice-conversion models.");
			return;
		}
		let disposed = false;
		setLoadingModels(true);
		void request("models", undefined)
			.then((r) => {
				const all = unwrapVoice(r).filter((m) => m.canConvert);
				if (!disposed) {
					setModels(all);
					setModelNotice(
						all.length
							? "Live ElevenLabs voice-conversion models loaded."
							: "No voice conversion models are available for this account.",
					);
				}
			})
			.catch(() => {
				if (!disposed)
					setModelNotice(
						"Offline fallback: standard v2 models. Refresh to check availability.",
					);
			})
			.finally(() => {
				if (!disposed) setLoadingModels(false);
			});
		return () => {
			disposed = true;
		};
	}, [hasKey, request, modelRevision]);
	useEffect(() => window.electronAPI.voice.onImportRequested(() => setExpanded(true)), []);
	const check = () => {
		if (!hasKey) {
			setConnect(true);
			throw new Error("missingKey");
		}
		if (!videoPath || !recording?.micPath) throw new Error("missingMic");
		if (!settings.noticeAccepted) throw new Error("noticeRequired");
	};
	const apply = async (next: VoiceSettings) => {
		setSettings(next);
		await request("saveSettings", next).then(unwrapVoice);
		if (!videoPath) throw new Error("missingMic");
		await request("start", { videoPath, settings: next }).then(unwrapVoice);
		setMessage(`Applying ${next.voiceName || "voice"}…`);
	};
	const useVoice = (voice: VoiceInfo) =>
		run(async () => {
			setApplyingId(voice.voiceId);
			const chosen = unwrapVoice(
				await request("chooseVoice", {
					voiceId: voice.voiceId,
					name: voice.name,
					publicOwnerId: voice.publicOwnerId,
				}),
			);
			setSettings(chosen);
			if (videoPath && recording?.micPath)
				unwrapVoice(await request("setVoiceChange", { videoPath, enabled: true }));
			setMessage(`Selected ${chosen.voiceName}. Click Process voice when ready.`);
		});
	const usePreset = (preset: VoicePreset) =>
		run(async () => {
			setApplyingId(preset.voice.voiceId);
			const next = unwrapVoice(await request("usePreset", preset));
			setSettings(next);
			if (videoPath && recording?.micPath)
				unwrapVoice(await request("setVoiceChange", { videoPath, enabled: true }));
			setMessage(`Selected ${next.voiceName}. Click Process voice when ready.`);
		});
	const status =
		job?.state === "running"
			? `Applying voice · ${job.completed}/${job.total || "…"} segments`
			: job?.state === "error"
				? t(`voice.${job.error}`, job.error)
				: job?.state === "cancelled"
					? "Conversion cancelled. Your previous audio is unchanged."
					: message.startsWith("Applying ") && job?.state === "done"
						? "Voice applied. Playback and export use the changed microphone."
						: t(`voice.${message || error}`, message || error);
	return (
		<main
			className={`voice-studio voice-compact ${embedded ? "voice-studio-embedded" : ""}`}
			aria-label="Voice / ElevenLabs"
		>
			<VoiceCueEditor recording={recording} disabled={processing} onSeek={onSeek} />
			<header className="voice-header">
				<WaveformIcon size={19} />
				<h1>Voice / ElevenLabs</h1>
				<button
					type="button"
					className="voice-key-button"
					onClick={() => setConnect(true)}
					data-help="Manage your secure ElevenLabs API key."
				>
					<KeyIcon size={14} />
					{hasKey ? "Connected" : "Connect"}
				</button>
			</header>
			<div className="voice-fixed-controls">
				<button
					type="button"
					className="voice-selector"
					aria-expanded={expanded}
					aria-controls="voice-browser-panel"
					onClick={() => setExpanded(!expanded)}
					data-help="Open the voice picker. Preview any voice, then choose Use to select it. Process explicitly when ready."
				>
					<div>
						<small>VOICE</small>
						<strong>{settings.voiceName || "Choose a voice"}</strong>
					</div>
					<CaretDownIcon
						size={16}
						style={{ transform: expanded ? "rotate(180deg)" : undefined }}
					/>
				</button>
				<div className="voice-track-row">
					<label htmlFor="voice-mic-track">Mic audio</label>
					<select
						id="voice-mic-track"
						disabled={!recording?.micPath || processing}
						value={recording?.micSelection ?? "original"}
						onChange={(e) => {
							const selection = e.target.value as "original" | "changed";
							void run(async () => {
								if (videoPath) {
									unwrapVoice(
										await request("selectMic", { videoPath, selection }),
									);
									setMessage(
										selection === "original"
											? "Original microphone selected."
											: "Changed microphone selected.",
									);
								}
							});
						}}
						data-help="Choose the microphone version used in playback and export. Your original is always kept."
					>
						<option value="original">Original microphone</option>
						<option value="changed" disabled={!recording?.changedMicPath}>
							{recording?.changedVoiceName || "Changed voice"}
						</option>
					</select>
				</div>
				{!recording?.micPath && (
					<p className="voice-hint">
						{!videoPath
							? "Open a finished recording to change its voice."
							: !loaded
								? "Checking microphone…"
								: "No isolated mic track in this recording."}
					</p>
				)}
				<button
					type="button"
					className="voice-primary"
					disabled={processing || !settings.voiceId || !recording?.micPath}
					onClick={() =>
						void run(async () => {
							check();
							setApplyingId(settings.voiceId);
							await apply(settings);
						})
					}
				>
					Process voice via ElevenLabs
				</button>
				{videoPath && recording?.micPath && (
					<VoiceCostEstimate videoPath={videoPath} modelId={settings.modelId} />
				)}
				<details className="voice-tuning-disclosure">
					<summary data-help="Expand to adjust the conversion model, stability, similarity, style, and noise reduction.">
						Voice settings <span>{modelLabel(settings.modelId)}</span>
					</summary>
					<fieldset className="voice-tuning" disabled={processing}>
						<legend>Voice tuning</legend>
						<label className="voice-model">
							Model
							<select
								value={settings.modelId}
								onChange={(e) =>
									setSettings({ ...settings, modelId: e.target.value })
								}
								data-help="Only models that support speech-to-speech conversion are listed. Voice quality labels may also include text-to-speech models."
							>
								{!models.some((m) => m.modelId === settings.modelId) && (
									<option value={settings.modelId}>
										{modelLabel(settings.modelId)} · unavailable
									</option>
								)}
								{models.map((m) => (
									<option key={m.modelId} value={m.modelId}>
										{m.name}
									</option>
								))}
							</select>
						</label>
						<div className="voice-model-status">
							<span>{modelNotice}</span>
							<button
								type="button"
								disabled={!hasKey || loadingModels}
								onClick={() => setModelRevision((n) => n + 1)}
							>
								{loadingModels ? "Checking…" : "Refresh models"}
							</button>
						</div>
						<p className="voice-hint">
							Multilingual v2 is recommended for recorded speech. Only models
							supporting voice conversion appear here.
						</p>
						<div className="voice-tuning-grid">
							{(["stability", "similarityBoost", "style"] as const).map((k) => (
								<label
									key={k}
									data-help={
										{
											stability:
												"Higher values keep delivery more consistent; lower values add variation.",
											similarityBoost:
												"How closely the result matches the selected voice.",
											style: "Emphasize the selected voice’s delivery style.",
										}[k]
									}
								>
									{k === "similarityBoost"
										? "Similarity"
										: k === "stability"
											? "Stability"
											: "Style"}
									<span>{Math.round(settings[k] * 100)}%</span>
									<input
										aria-label={
											k === "similarityBoost"
												? "Similarity"
												: k === "stability"
													? "Stability"
													: "Style"
										}
										type="range"
										min="0"
										max="1"
										step="0.01"
										value={settings[k]}
										onChange={(e) =>
											setSettings({
												...settings,
												[k]: Number(e.target.value),
											})
										}
									/>
								</label>
							))}
						</div>
						<div className="voice-checks">
							<label data-help="Ask ElevenLabs to remove background noise from microphone audio.">
								<input
									type="checkbox"
									checked={settings.removeBackgroundNoise}
									onChange={(e) =>
										setSettings({
											...settings,
											removeBackgroundNoise: e.target.checked,
										})
									}
								/>
								Denoise
							</label>
							<label data-help="Improve similarity to the selected speaker when supported by the model.">
								<input
									type="checkbox"
									checked={settings.useSpeakerBoost}
									onChange={(e) =>
										setSettings({
											...settings,
											useSpeakerBoost: e.target.checked,
										})
									}
								/>
								Speaker boost
							</label>
							<button
								type="button"
								disabled={!settings.voiceId || !recording?.micPath}
								onClick={() =>
									void run(async () => {
										unwrapVoice(await request("saveSettings", settings));
										setMessage(
											"Voice settings saved. Process voice when ready.",
										);
									})
								}
								data-help="Save these voice settings. Processing starts only when you click Process voice."
							>
								Save tuning
							</button>
						</div>
					</fieldset>
				</details>
				<label
					className="voice-upload"
					data-help="Only the microphone audio is sent to ElevenLabs when you click Process voice. Video and computer audio stay local."
				>
					<input
						type="checkbox"
						checked={settings.noticeAccepted}
						disabled={processing}
						onChange={(e) =>
							setSettings({ ...settings, noticeAccepted: e.target.checked })
						}
					/>
					Allow mic upload to ElevenLabs when I click Process
				</label>
			</div>
			<div id="voice-browser-panel" className="voice-browser-slot" hidden={!expanded}>
				<VoiceBrowser
					enabled={hasKey}
					settings={settings}
					models={models}
					selectedVoiceId={selectedVoiceId}
					applyingVoiceId={processing ? applyingId || settings.voiceId : ""}
					disabled={processing}
					onUseVoice={useVoice}
					onUsePreset={usePreset}
				/>
			</div>
			<footer className="voice-footer">
				<div className="voice-status" role="status">
					{status || "Preview → Use → Process → Export"}
				</div>
				{job?.state === "running" && (
					<button
						type="button"
						onClick={() =>
							void run(async () => {
								unwrapVoice(await request("cancel", job.jobId));
								setMessage("Cancelling…");
							})
						}
					>
						Cancel
					</button>
				)}
				<button
					type="button"
					aria-label="Connect iPad"
					onClick={() =>
						void window.electronAPI.board
							.request("open", { tab: "ipad" })
							.catch(() => setMessage("Could not open iPad pairing."))
					}
					data-help="Open the QR code pairing panel for your iPad."
				>
					<DeviceTabletIcon size={16} />
				</button>
			</footer>
			<Dialog open={connect} onOpenChange={setConnect}>
				<DialogContent className="voice-studio voice-modal" aria-describedby={undefined}>
					<DialogTitle>ElevenLabs connection</DialogTitle>
					<p>Your key is encrypted on this computer and excluded from shared presets.</p>
					<label>
						API key
						<input
							type="password"
							autoComplete="off"
							value={key}
							onChange={(e) => setKey(e.target.value)}
							placeholder={hasKey ? "Enter replacement key" : "Enter API key"}
						/>
					</label>
					<div className="voice-toolbar">
						<button
							type="button"
							disabled={busy || !key.trim()}
							onClick={() =>
								void run(async () => {
									setHasKey(unwrapVoice(await request("setKey", key)).hasKey);
									setKey("");
									setMessage("API key saved.");
									setConnect(false);
								})
							}
						>
							Save key
						</button>
						<button
							type="button"
							disabled={busy || !hasKey}
							onClick={() =>
								void run(async () => {
									unwrapVoice(await request("testKey", undefined));
									setMessage("ElevenLabs connection verified.");
								})
							}
						>
							Test connection
						</button>
					</div>
					<p role="status">{t(`voice.${message}`, message)}</p>
				</DialogContent>
			</Dialog>
		</main>
	);
}
