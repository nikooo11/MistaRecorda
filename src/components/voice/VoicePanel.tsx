import { VoiceBrowser } from "./VoiceBrowser";
import "./voice.css";
import { VoiceLibrary } from "./VoiceLibrary";
import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	defaultVoiceSettings,
	unwrapVoice,
	type VoiceSettings,
	type VoiceInfo,
} from "@/types/voice";
export function VoicePanel() {
	const t = useScopedT("settings");
	const [settings, setSettings] = useState<VoiceSettings>(defaultVoiceSettings);
	const [hasKey, setHasKey] = useState(false);
	const [key, setKey] = useState("");
	const [voices, setVoices] = useState<VoiceInfo[]>([]);
	const [message, setMessage] = useState("");
	const request = window.electronAPI.voice.request;
	const run = async (action: () => Promise<void>) => {
		try {
			await action();
		} catch (e) {
			setMessage(e instanceof Error ? e.message : "operationFailed");
		}
	};
	useEffect(() => {
		const load = () => {
			void request("getSettings", undefined)
				.then((r) => {
					const next = unwrapVoice(r);
					setSettings(next);
					setHasKey(next.hasKey);
				})
				.catch(() => setMessage("operationFailed"));
		};
		load();
		return window.electronAPI.voice.onSettingsChanged(load);
	}, [request]);
	return (
		<main className="h-screen overflow-auto bg-editor-bg text-foreground p-6 space-y-4">
			<h1 className="text-xl font-semibold">{t("voice.title")}</h1>
			<p>{t("voice.notice")}</p>
			<label className="block">
				<input
					type="checkbox"
					checked={settings.noticeAccepted}
					onChange={(e) => setSettings({ ...settings, noticeAccepted: e.target.checked })}
				/>
				{t("voice.acceptNotice")}
			</label>
			<p>{hasKey ? t("voice.keyPresent") : t("voice.keyMissing")}</p>
			<label>
				{t("voice.apiKey")}
				<input
					type="password"
					autoComplete="off"
					value={key}
					onChange={(e) => setKey(e.target.value)}
					className="bg-black/20 border rounded p-2 mx-2"
				/>
			</label>
			<button
				type="button"
				onClick={() =>
					void run(async () => {
						setHasKey(unwrapVoice(await request("setKey", key)).hasKey);
						setKey("");
						setMessage("saved");
					})
				}
			>
				{t("voice.saveKey")}
			</button>
			<button
				type="button"
				className="mx-3"
				onClick={() =>
					void run(async () => {
						unwrapVoice(await request("testKey", undefined));
						setMessage("keyReady");
					})
				}
			>
				{t("voice.testKey")}
			</button>
			<label className="block">
				<input
					type="checkbox"
					checked={settings.enabled}
					onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
				/>
				{t("voice.autoRun")}
			</label>
			<button
				type="button"
				onClick={() =>
					void run(async () =>
						setVoices(unwrapVoice(await request("listVoices", undefined))),
					)
				}
			>
				{t("voice.loadVoices")}
			</button>
			<select
				aria-label={t("voice.voice")}
				className="bg-black/20 p-2"
				value={settings.voiceId}
				onChange={(e) =>
					setSettings({
						...settings,
						voiceId: e.target.value,
						voiceName: voices.find((v) => v.voiceId === e.target.value)?.name ?? "",
					})
				}
			>
				<option value="">{t("voice.chooseVoice")}</option>
				{voices.map((v) => (
					<option key={v.voiceId} value={v.voiceId}>
						{v.name}
					</option>
				))}
			</select>
			{voices.find((v) => v.voiceId === settings.voiceId)?.previewUrl && (
				<audio
					controls
					src={
						voices.find((v) => v.voiceId === settings.voiceId)?.previewUrl ?? undefined
					}
				/>
			)}
			<label className="block">
				{t("voice.model")}
				<select
					className="bg-black/20 p-2"
					value={settings.modelId}
					onChange={(e) =>
						setSettings({
							...settings,
							modelId: e.target.value as VoiceSettings["modelId"],
						})
					}
				>
					<option value="eleven_multilingual_sts_v2">Multilingual STS v2</option>
					<option value="eleven_english_sts_v2">English STS v2</option>
				</select>
			</label>
			{(["stability", "similarityBoost", "style"] as const).map((k) => (
				<label className="block" key={k}>
					{t(`voice.${k}`)} {settings[k]}
					<input
						className="mx-3"
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={settings[k]}
						onChange={(e) => setSettings({ ...settings, [k]: Number(e.target.value) })}
					/>
				</label>
			))}
			{(["removeBackgroundNoise", "useSpeakerBoost"] as const).map((k) => (
				<label className="block" key={k}>
					<input
						type="checkbox"
						checked={settings[k]}
						onChange={(e) => setSettings({ ...settings, [k]: e.target.checked })}
					/>
					{t(`voice.${k}`)}
				</label>
			))}
			<button
				type="button"
				className="rounded bg-teal-700 px-4 py-2"
				onClick={() =>
					void run(async () => {
						unwrapVoice(await request("saveSettings", settings));
						setMessage("saved");
					})
				}
			>
				{t("voice.save")}
			</button>
			<p role="status">{message ? t(`voice.${message}`) : ""}</p>
			<VoiceBrowser />
			<VoiceLibrary />
		</main>
	);
}
