import { ZoomShortcutInput } from "./ZoomShortcutInput";
import { WindowHeader } from "../ui/WindowHeader";
import { MagnifyingGlassIcon, InfoIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	defaultRecordingZoomSettings,
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
			onClick={() => void window.electronAPI.recordingZoom.openSettings(true)}
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
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (status) setSettings(status.settings);
	}, [status]);
	const scale = ZOOM_DEPTH_SCALES[settings.depth];
	return (
		<main className="recording-zoom-settings">
			<WindowHeader className="zoom-heading">
				<MagnifyingGlassIcon size={17} />
				<h1>{t("recordingZoom.title")}</h1>
				<Popover>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="zoom-info-button"
							aria-label={t("recordingZoom.infoTitle")}
						>
							<InfoIcon size={16} />
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
						<p>{t("recordingZoom.exclusion")}</p>
					</PopoverContent>
				</Popover>
			</WindowHeader>
			<div className="zoom-settings-body">
				<p className="zoom-description">{t("recordingZoom.description")}</p>
				<div className="zoom-settings-grid">
					<fieldset
						disabled={!status || status.recording || saving}
						onChange={() => setMessage("")}
					>
						<label className="zoom-toggle">
							<input
								type="checkbox"
								checked={settings.enabled}
								onChange={(e) =>
									setSettings({ ...settings, enabled: e.target.checked })
								}
							/>
							{t("recordingZoom.enable")}
						</label>
						<div className="zoom-setting-row">
							<div>
								<span className="zoom-shortcut-label">Zoom shortcut</span>
								<ZoomShortcutInput
									value={settings}
									onChange={setSettings}
									disabled={!status || status.recording || saving}
								/>
							</div>
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
				</div>
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
			</div>
			<footer className="zoom-footer">
				<span role="status">
					{message
						? t(`recordingZoom.${message}`, message)
						: recordingZoomShortcut(settings) + " · " + scale + "×"}
				</span>
				<button
					className="zoom-save"
					type="button"
					disabled={!status || status.recording || saving}
					onClick={async () => {
						setSaving(true);
						try {
							const result =
								await window.electronAPI.recordingZoom.saveSettings(settings);
							setMessage(
								result.success ? "saved" : result.error || "invalidSettings",
							);
						} catch {
							setMessage("invalidSettings");
						} finally {
							setSaving(false);
						}
					}}
				>
					{t("recordingZoom.save")}
				</button>
			</footer>
		</main>
	);
}
