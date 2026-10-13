import { useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { unwrapVoice } from "@/types/voice";
import type { VoicePreset } from "@/types/voicePreset";
export function PresetEditor({
	initial,
	onSaved,
	onClose,
}: {
	initial: VoicePreset;
	onSaved: () => void;
	onClose: () => void;
}) {
	const t = useScopedT("settings");
	const [preset, setPreset] = useState(initial);
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const [includeSamples, setIncludeSamples] = useState(false);
	const [consent, setConsent] = useState(false);
	const [recipient, setRecipient] = useState("");
	const [kind, setKind] = useState<"email" | "group">("email");
	const [role, setRole] = useState<"viewer" | "editor" | "admin">("viewer");
	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		setMessage("");
		try {
			await action();
		} catch (e) {
			setMessage(e instanceof Error ? e.message : "operationFailed");
		} finally {
			setBusy(false);
		}
	};
	const save = async (copy: boolean) => {
		const now = new Date().toISOString();
		setPreset(
			unwrapVoice(
				await window.electronAPI.voice.request("savePreset", {
					...preset,
					id: copy ? crypto.randomUUID() : preset.id,
					name: copy ? `${preset.name} (${t("voice.copy")})` : preset.name,
					createdAt: copy ? now : preset.createdAt,
					updatedAt: now,
				}),
			),
		);
		onSaved();
		setMessage("saved");
	};
	const settings = preset.settings;
	return (
		<section
			className="rounded-xl border border-teal-600 p-4 space-y-3"
			aria-label={t("voice.presetEditor")}
		>
			<div className="flex justify-between">
				<h2>{t("voice.presetEditor")}</h2>
				<button type="button" onClick={onClose}>
					{t("voice.close")}
				</button>
			</div>
			<label className="block">
				{t("voice.name")}
				<input
					className="voice-input"
					value={preset.name}
					onChange={(e) => setPreset({ ...preset, name: e.target.value })}
				/>
			</label>
			<label className="block">
				{t("voice.createdBy")}
				<input
					className="voice-input"
					value={preset.createdBy}
					onChange={(e) => setPreset({ ...preset, createdBy: e.target.value })}
				/>
			</label>
			<p>
				{preset.voice.originalName} · {preset.voice.voiceId}
			</p>
			<label className="block">
				{t("voice.tags")}
				<input
					className="voice-input"
					value={preset.tags.join(", ")}
					onChange={(e) =>
						setPreset({
							...preset,
							tags: e.target.value
								.split(",")
								.map((v) => v.trim())
								.filter(Boolean),
						})
					}
				/>
			</label>
			<label className="block">
				<input
					type="checkbox"
					checked={preset.isFavorite}
					onChange={(e) => setPreset({ ...preset, isFavorite: e.target.checked })}
				/>
				{t("voice.favorite")}
			</label>
			<label className="block">
				{t("voice.model")}
				<select
					className="voice-input"
					value={settings.modelId}
					onChange={(e) =>
						setPreset({
							...preset,
							settings: {
								...settings,
								modelId: e.target.value as typeof settings.modelId,
							},
						})
					}
				>
					<option value="eleven_multilingual_sts_v2">eleven_multilingual_sts_v2</option>
					<option value="eleven_english_sts_v2">eleven_english_sts_v2</option>
				</select>
			</label>
			{(["stability", "similarityBoost", "style"] as const).map((k) => (
				<label className="block" key={k}>
					{t(`voice.${k}`)} {settings[k]}
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={settings[k]}
						onChange={(e) =>
							setPreset({
								...preset,
								settings: { ...settings, [k]: Number(e.target.value) },
							})
						}
					/>
				</label>
			))}
			{(["useSpeakerBoost", "removeBackgroundNoise"] as const).map((k) => (
				<label className="block" key={k}>
					<input
						type="checkbox"
						checked={settings[k]}
						onChange={(e) =>
							setPreset({
								...preset,
								settings: { ...settings, [k]: e.target.checked },
							})
						}
					/>
					{t(`voice.${k}`)}
				</label>
			))}
			<label className="block">
				{t("voice.loudness")}
				<input
					className="voice-input"
					type="number"
					min="-30"
					max="-10"
					value={settings.postFx.loudnessLufs}
					onChange={(e) =>
						setPreset({
							...preset,
							settings: {
								...settings,
								postFx: {
									...settings.postFx,
									loudnessLufs: Number(e.target.value),
								},
							},
						})
					}
				/>
			</label>
			<label className="block">
				{t("voice.pitch")}
				<input
					className="voice-input"
					type="number"
					min="-12"
					max="12"
					step="0.5"
					value={settings.postFx.pitchSemitones}
					onChange={(e) =>
						setPreset({
							...preset,
							settings: {
								...settings,
								postFx: {
									...settings.postFx,
									pitchSemitones: Number(e.target.value),
								},
							},
						})
					}
				/>
			</label>
			<label className="block">
				{t("voice.eq")}
				<select
					className="voice-input"
					value={settings.postFx.eqPreset}
					onChange={(e) =>
						setPreset({
							...preset,
							settings: {
								...settings,
								postFx: {
									...settings.postFx,
									eqPreset: e.target.value as typeof settings.postFx.eqPreset,
								},
							},
						})
					}
				>
					{["none", "warm", "bright"].map((v) => (
						<option value={v} key={v}>
							{t(`voice.${v}`)}
						</option>
					))}
				</select>
			</label>
			{preset.preview.base64 && (
				<audio
					controls
					src={`data:audio/${preset.preview.format};base64,${preset.preview.base64}`}
				/>
			)}
			<button
				type="button"
				disabled={busy}
				onClick={() =>
					void run(async () =>
						setPreset(
							unwrapVoice(
								await window.electronAPI.voice.request("previewPreset", preset),
							),
						),
					)
				}
			>
				{t("voice.generatePreview")}
			</button>
			<div className="flex gap-4">
				<button type="button" disabled={busy} onClick={() => void run(() => save(false))}>
					{t("voice.save")}
				</button>
				<button type="button" disabled={busy} onClick={() => void run(() => save(true))}>
					{t("voice.saveAsNew")}
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={() =>
						void run(async () => {
							unwrapVoice(
								await window.electronAPI.voice.request("usePreset", preset),
							);
							setMessage("presetApplied");
						})
					}
				>
					{t("voice.use")}
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={() =>
						void run(async () => {
							unwrapVoice(
								await window.electronAPI.voice.request("deletePreset", preset.id),
							);
							onSaved();
							onClose();
						})
					}
				>
					{t("voice.delete")}
				</button>
			</div>
			<label className="block">
				<input
					type="checkbox"
					checked={includeSamples}
					onChange={(e) => setIncludeSamples(e.target.checked)}
				/>
				{t("voice.includeSamples")}
			</label>
			{includeSamples && (
				<label className="block">
					<input
						type="checkbox"
						checked={consent}
						onChange={(e) => setConsent(e.target.checked)}
					/>
					{t("voice.sampleConsent")}
				</label>
			)}
			<button
				type="button"
				disabled={busy || (includeSamples && !consent)}
				onClick={() =>
					void run(async () => {
						unwrapVoice(
							await window.electronAPI.voice.request("exportPreset", {
								preset,
								includeSamples,
								consent,
							}),
						);
					})
				}
			>
				{t("voice.export")}
			</button>
			<fieldset className="border-t pt-3 space-y-2">
				<legend>{t("voice.shareTeam")}</legend>
				<p>{t("voice.workspaceRequired")}</p>
				<select
					className="voice-input"
					aria-label={t("voice.recipientType")}
					value={kind}
					onChange={(e) => setKind(e.target.value as typeof kind)}
				>
					<option value="email">{t("voice.email")}</option>
					<option value="group">{t("voice.group")}</option>
				</select>
				<input
					className="voice-input"
					aria-label={t("voice.recipient")}
					value={recipient}
					onChange={(e) => setRecipient(e.target.value)}
				/>
				<select
					className="voice-input"
					aria-label={t("voice.role")}
					value={role}
					onChange={(e) => setRole(e.target.value as typeof role)}
				>
					{["viewer", "editor", "admin"].map((v) => (
						<option key={v} value={v}>
							{t(`voice.${v}`)}
						</option>
					))}
				</select>
				<button
					type="button"
					disabled={busy || !recipient}
					onClick={() =>
						void run(async () => {
							unwrapVoice(
								await window.electronAPI.voice.request("shareVoice", {
									voiceId: preset.voice.voiceId,
									recipient,
									role,
									kind,
								}),
							);
							setMessage("shared");
						})
					}
				>
					{t("voice.shareTeam")}
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={() =>
						void run(async () => {
							unwrapVoice(
								await window.electronAPI.voice.request("copyToTeam", {
									...preset,
									updatedAt: new Date().toISOString(),
								}),
							);
							onSaved();
							setMessage("shared");
						})
					}
				>
					{t("voice.copyToTeam")}
				</button>
			</fieldset>
			<p role="status">{busy ? t("voice.working") : message ? t(`voice.${message}`) : ""}</p>
		</section>
	);
}
