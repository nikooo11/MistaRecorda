import { useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { defaultVoiceSettings, unwrapVoice, type VoiceInfo } from "@/types/voice";
export function TrainedVoiceEditor({ voice, onClose }: { voice: VoiceInfo; onClose: () => void }) {
	const t = useScopedT("settings");
	const [name, setName] = useState(voice.name);
	const [description, setDescription] = useState(voice.description ?? "");
	const [labels, setLabels] = useState(JSON.stringify(voice.labels ?? {}));
	const [settings, setSettings] = useState({ ...defaultVoiceSettings, ...voice.defaultSettings });
	const [addSamples, setAddSamples] = useState(false);
	const [consent, setConsent] = useState(false);
	const [message, setMessage] = useState("");
	if (!voice.canEdit) return <p>{t("voice.voiceNotOwned")}</p>;
	return (
		<section className="border rounded p-4 space-y-3">
			<h2>{t("voice.editTrainedVoice")}</h2>
			<label className="block">
				{t("voice.name")}
				<input
					className="voice-input"
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
			<label className="block">
				{t("voice.labels")}
				<textarea
					className="voice-input"
					value={labels}
					onChange={(e) => setLabels(e.target.value)}
				/>
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
			<label className="block">
				<input
					type="checkbox"
					checked={addSamples}
					onChange={(e) => setAddSamples(e.target.checked)}
				/>
				{t("voice.addSamples")}
			</label>
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
			<button
				type="button"
				disabled={addSamples && !consent}
				onClick={() => {
					void (async () => {
						try {
							unwrapVoice(
								await window.electronAPI.voice.request("editVoice", {
									voiceId: voice.voiceId,
									name,
									description,
									labels: JSON.parse(labels),
									settings,
									addSamples,
									consent,
								}),
							);
							setMessage("saved");
						} catch (e) {
							setMessage(
								e instanceof SyntaxError
									? "invalidSettings"
									: e instanceof Error
										? e.message
										: "operationFailed",
							);
						}
					})();
				}}
			>
				{t("voice.save")}
			</button>
			<button type="button" onClick={onClose}>
				{t("voice.close")}
			</button>
			<p role="status">{message ? t(`voice.${message}`) : ""}</p>
		</section>
	);
}
