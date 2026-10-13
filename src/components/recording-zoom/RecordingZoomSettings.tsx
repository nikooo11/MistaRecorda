import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	defaultRecordingZoomSettings,
	RECORDING_ZOOM_KEYS,
	recordingZoomShortcut,
	type RecordingZoomStatus,
} from "@/types/recordingZoom";
import { ZOOM_DEPTH_SCALES, type ZoomDepth } from "../video-editor/types";
import "./recordingZoom.css";

export function useRecordingZoomStatus() {
	const [status, setStatus] = useState<RecordingZoomStatus | null>(null);
	useEffect(() => {
		let disposed = false;
		void window.electronAPI.recordingZoom
			.getStatus()
			.then((s) => {
				if (!disposed) setStatus(s);
			})
			.catch(() => {
				if (!disposed) setStatus(null);
			});
		const stop = window.electronAPI.recordingZoom.onStatus(setStatus);
		return () => {
			disposed = true;
			stop();
		};
	}, []);
	return status;
}
export function RecordingZoomControl() {
	const status = useRecordingZoomStatus();
	const t = useScopedT("settings");
	return (
		<button
			type="button"
			className="recording-zoom-control"
			onClick={() => void window.electronAPI.recordingZoom.openSettings()}
			title={t("recordingZoom.title")}
		>
			{status?.following
				? t("recordingZoom.following")
				: status?.holding
					? t("recordingZoom.holding")
					: t("recordingZoom.shortLabel")}{" "}
			{status?.settings.enabled
				? recordingZoomShortcut(status.settings)
				: t("recordingZoom.off")}
			{status?.recording && (
				<span>
					{" "}
					· {status.count}
					{!status.hookReady ? " !" : ""}
				</span>
			)}
		</button>
	);
}
export function RecordingZoomSettingsPanel() {
	const t = useScopedT("settings");
	const status = useRecordingZoomStatus();
	const [settings, setSettings] = useState(defaultRecordingZoomSettings);
	const [message, setMessage] = useState("");
	useEffect(() => {
		if (status) setSettings(status.settings);
	}, [status]);
	const scale = ZOOM_DEPTH_SCALES[settings.depth];
	return (
		<main className="recording-zoom-settings">
			<div className="zoom-eyebrow">MistaRecorda</div>
			<div className="zoom-heading">
				<h1>{t("recordingZoom.title")}</h1>
				<Popover>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="zoom-info-button"
							aria-label={t("recordingZoom.infoTitle")}
						>
							i
						</button>
					</PopoverTrigger>
					<PopoverContent
						className="zoom-info-bubble"
						aria-label={t("recordingZoom.infoTitle")}
					>
						<strong>{t("recordingZoom.infoTitle")}</strong>
						<p>
							{t("recordingZoom.infoHold", undefined, {
								shortcut: recordingZoomShortcut(settings),
							})}
						</p>
						<p>
							{t("recordingZoom.infoTap", undefined, {
								shortcut: recordingZoomShortcut(settings),
							})}
						</p>
						<p>{t("recordingZoom.infoCapture")}</p>
						<p>{t("recordingZoom.infoEdit")}</p>
					</PopoverContent>
				</Popover>
			</div>
			<p>{t("recordingZoom.description")}</p>
			<fieldset disabled={status?.recording}>
				<label className="zoom-toggle">
					<input
						type="checkbox"
						checked={settings.enabled}
						onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
					/>
					{t("recordingZoom.enable")}
				</label>
				<div className="zoom-setting-row">
					<label>
						{t("recordingZoom.key")}
						<select
							aria-label={t("recordingZoom.key")}
							value={settings.key}
							onChange={(e) => setSettings({ ...settings, key: e.target.value })}
						>
							{RECORDING_ZOOM_KEYS.map((key) => (
								<option key={key}>{key}</option>
							))}
						</select>
					</label>
					<label>
						{t("recordingZoom.amount")}
						<select
							aria-label={t("recordingZoom.amount")}
							value={settings.depth}
							onChange={(e) =>
								setSettings({
									...settings,
									depth: Number(e.target.value) as ZoomDepth,
								})
							}
						>
							{([1, 2, 3, 4, 5, 6] as const).map((depth) => (
								<option key={depth} value={depth}>
									{ZOOM_DEPTH_SCALES[depth]}×
								</option>
							))}
						</select>
					</label>
				</div>
				<div className="zoom-modifiers">
					{(["ctrl", "alt", "shift", "meta"] as const).map((key) => (
						<label key={key}>
							<input
								type="checkbox"
								checked={settings[key]}
								onChange={(e) =>
									setSettings({ ...settings, [key]: e.target.checked })
								}
							/>
							{key === "meta"
								? t("recordingZoom.meta")
								: key[0].toUpperCase() + key.slice(1)}
						</label>
					))}
				</div>
				<button
					className="zoom-save"
					type="button"
					onClick={() =>
						void window.electronAPI.recordingZoom
							.saveSettings(settings)
							.then((r) =>
								setMessage(r.success ? "saved" : r.error || "invalidSettings"),
							)
							.catch(() => setMessage("invalidSettings"))
					}
				>
					{t("recordingZoom.save")}
				</button>
			</fieldset>
			<div className="zoom-preview" aria-label={t("recordingZoom.preview")}>
				<div className="zoom-preview-bar">
					<span />
					<span />
					<span />
					<small>{t("recordingZoom.preview")}</small>
				</div>
				<div className="zoom-preview-content">
					<div />
					<div />
					<div />
				</div>
				<div
					className="zoom-preview-target"
					style={{ width: `${100 / scale}%`, height: `${100 / scale}%` }}
				>
					<span>
						{recordingZoomShortcut(settings)} · {scale}×
					</span>
				</div>
			</div>
			<p className="zoom-help">{t("recordingZoom.locked")}</p>
			<p className="zoom-help">{t("recordingZoom.exclusion")}</p>
			<p className="zoom-help">{t("recordingZoom.keyPassThrough")}</p>
			{status?.recording && (
				<p role="status">
					{t(
						status.hookReady
							? "recordingZoom.recordingActive"
							: "recordingZoom.hookUnavailable",
					)}
					{!status.outlineAvailable && ` ${t("recordingZoom.outlineHidden")}`}
				</p>
			)}
			<p role="status">{message ? t(`recordingZoom.${message}`) : ""}</p>
		</main>
	);
}
