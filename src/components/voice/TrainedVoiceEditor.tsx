import { useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { defaultVoiceSettings, unwrapVoice, type VoiceInfo } from "@/types/voice";
export function TrainedVoiceEditor({
	voice,
	onSaved,
	onMakePreset,
	onClose,
}: {
	voice: VoiceInfo;
	onSaved: (voice: VoiceInfo) => void;
	onMakePreset: (voice: VoiceInfo) => void;
	onClose: () => void;
}) {
	const t = useScopedT("settings");
	const [name, setName] = useState(voice.name);
	const [description, setDescription] = useState(voice.description ?? "");
	const [labels, setLabels] = useState<Record<string, string>>(voice.labels ?? {});
	const [settings, setSettings] = useState({ ...defaultVoiceSettings, ...voice.defaultSettings });
	const [addSamples, setAddSamples] = useState(false);
	const [consent, setConsent] = useState(false);
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const save = async (makePreset: boolean) => {
		if (busy) return;
		setBusy(true);
		setMessage("");
		try {
			const parsedLabels = Object.fromEntries(
				Object.entries(labels).filter(([, value]) => value.trim()),
			);
			const savedName = name.trim();
			unwrapVoice(
				await window.electronAPI.voice.request("editVoice", {
					voiceId: voice.voiceId,
					name: savedName,
					description,
					labels: parsedLabels,
					settings,
					addSamples,
					consent,
				}),
			);
			const updated = {
				...voice,
				name: savedName,
				description,
				labels: parsedLabels,
				defaultSettings: {
					stability: settings.stability,
					similarityBoost: settings.similarityBoost,
					style: settings.style,
					useSpeakerBoost: settings.useSpeakerBoost,
				},
			};
			setName(savedName);
			onSaved(updated);
			setMessage("saved");
			if (makePreset) onMakePreset(updated);
		} catch (e) {
			setMessage(
				e instanceof SyntaxError
					? "invalidSettings"
					: e instanceof Error
						? e.message
						: "operationFailed",
			);
		} finally {
			setBusy(false);
		}
	};
	if (!voice.canEdit) return <p>{t("voice.voiceNotOwned")}</p>;
	return (
		<section className="rounded space-y-3 text-sm">
			<h2>{t("voice.editTrainedVoice")}</h2>
			<label className="block">
				{t("voice.name")}
				<input
					className="voice-input"
					maxLength={160}
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
			</label>
			<label className="block">
				{t("voice.description")}
				<textarea
					className="voice-input"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
				/>
			</label>
			<div className="grid grid-cols-2 gap-2">
				{["language", "accent", "gender", "age"].map((key) => (
					<label className="block capitalize" key={key}>
						{key}
						<input
							className="voice-input"
							maxLength={256}
							value={labels[key] ?? ""}
							onChange={(e) => setLabels({ ...labels, [key]: e.target.value })}
						/>
					</label>
				))}
			</div>
			{(["stability", "similarityBoost", "style"] as const).map((k) => (
				<label className="block" key={k}>
					{t(`voice.${k}`)} {settings[k]}
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={settings[k]}
						onChange={(e) => setSettings({ ...settings, [k]: Number(e.target.value) })}
					/>
				</label>
			))}
			<label className="block">
				<input
					type="checkbox"
					checked={settings.useSpeakerBoost}
					onChange={(e) =>
						setSettings({ ...settings, useSpeakerBoost: e.target.checked })
					}
				/>
				{t("voice.useSpeakerBoost")}
			</label>
			{voice.category === "cloned" && (
				<label className="block">
					<input
						type="checkbox"
						checked={addSamples}
						onChange={(e) => setAddSamples(e.target.checked)}
					/>
					{t("voice.addSamples")}
				</label>
			)}
			{voice.category === "professional" && (
				<p className="text-sm">
					Update professional training samples and verification in ElevenLabs Voices.
					Name, labels, and conversion defaults can be edited here.
				</p>
			)}
			{addSamples && (
				<label className="block">
					<input
						type="checkbox"
						checked={consent}
						onChange={(e) => setConsent(e.target.checked)}
					/>
					{t("voice.sampleConsent")}
				</label>
			)}
			<p className="text-sm">{t("voice.customVoiceNameHelp")}</p>
			<button
				type="button"
				disabled={busy || !name.trim() || (addSamples && !consent)}
				onClick={() => void save(false)}
			>
				{t("voice.save")}
			</button>
			<button
				type="button"
				disabled={busy || !name.trim() || (addSamples && !consent)}
				onClick={() => void save(true)}
			>
				{t("voice.saveAndMakePreset")}
			</button>
			<button type="button" disabled={busy} onClick={onClose}>
				{t("voice.close")}
			</button>
			<p role="status">{busy ? t("voice.working") : message ? t(`voice.${message}`) : ""}</p>
		</section>
	);
}
