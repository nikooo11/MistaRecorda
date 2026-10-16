import { ApiSetup } from "./ApiSetup";
import { GearSixIcon, KeyboardIcon, SpeakerHighIcon, StackIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioInfo, StudioSource } from "../../types/studio";
import { SceneWorkspace } from "./SceneWorkspace";
import { SoundboardSettings, SoundRecordingOption } from "./SoundboardSettings";
import "./studio.css";
import { ShortcutInput } from "./ShortcutInput";
import { SettingsGuideLink } from "../settings-guide/SettingsGuideLink";
import { WindowHeader } from "../ui/WindowHeader";

import { loadEditorPreferences, saveEditorPreferences } from "../video-editor/editorPreferences";
import { SettingsTourProvider } from "../settings-guide/SettingHelp";

export { ShortcutInput } from "./ShortcutInput";
export function StudioPanel() {
	const [info, setInfo] = useState<StudioInfo>();
	const modifier = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";
	const [tab, setTab] = useState<import("../../types/studio").StudioTab>("layers");
	const content = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (content.current) content.current.scrollTop = 0;
	}, [tab]);
	const [sources, setSources] = useState<StudioSource[]>([]);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [resetMessage, setResetMessage] = useState("");
	const [autoZoom, setAutoZoom] = useState(
		() => loadEditorPreferences().autoApplyFreshRecordingAutoZooms,
	);
	const run = useCallback(async (method: string, input?: unknown) => {
		setBusy(true);
		setError("");
		try {
			const result = await window.electronAPI.studio.request(method, input);
			setInfo(result);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}, []);
	const saveShortcut = async (method: string, input: unknown) => {
		const result = await window.electronAPI.studio.request(method, input);
		setInfo(result);
		setError("");
	};
	const refresh = useCallback(async () => {
		try {
			const all = await window.electronAPI.getSources({
				types: ["window", "screen"],
				thumbnailSize: { width: 240, height: 150 },
				fetchWindowIcons: true,
			});
			setSources(all as StudioSource[]);
		} catch (e) {
			setError((e as Error).message);
		}
	}, []);
	useEffect(() => {
		void run("info");
		void refresh();
		const stop = window.electronAPI.studio.onChanged(setInfo);
		const sourceChanged = window.electronAPI.onSelectedSourceChanged(() => void run("info"));
		return () => {
			stop();
			sourceChanged?.();
		};
	}, [run, refresh]);
	useEffect(() => {
		if (info?.panelTab) setTab(info.panelTab);
	}, [info?.panelTab]);
	if (!info)
		return <main className="capture-studio">{error || "Opening capture settings…"}</main>;
	return (
		<SettingsTourProvider request={info.guideTour} navigate={setTab}>
			<main className="capture-studio">
				<WindowHeader className="capture-heading">
					<GearSixIcon size={17} />
					<h1>Capture settings</h1>
					<SettingsGuideLink />
				</WindowHeader>
				<nav className="capture-tabs" aria-label="Capture settings">
					{(
						[
							{ id: "setup", label: "Setup", Icon: GearSixIcon },
							{ id: "controls", label: "Recording", Icon: KeyboardIcon },
							{ id: "layers", label: "Layers", Icon: StackIcon },
							{ id: "scenes", label: "Scenes & shortcuts", Icon: StackIcon },
							{ id: "sounds", label: "Sound effects", Icon: SpeakerHighIcon },
						] as const
					).map(({ id, label, Icon }) => (
						<button
							key={id}
							aria-pressed={tab === id}
							onClick={() => {
								setTab(id);
								void run("panelTab", id);
							}}
							title={
								{
									setup: "Manage your OpenAI and ElevenLabs API keys in one place.",
									layers: "Choose screens and windows, assign shortcuts, and save environments.",
									windows:
										"Assign hotkeys to switch the recorded application window during a take.",
									sounds: "Import sound clips, preview them, and choose hotkeys that add them to your recording.",
									controls:
										"Recording defaults, camera shortcut, and capture glow.",
									scenes: "Recall a source, camera layout, and audio inputs with one shortcut.",
								}[id]
							}
						>
							<Icon size={18} />
							{label}
						</button>
					))}
				</nav>
				<div className="capture-content" ref={content}>
					{tab === "setup" && <ApiSetup />}
					{(tab === "layers" || tab === "scenes" || tab === "windows") && (
						<SceneWorkspace
							key={tab}
							info={info}
							sources={sources}
							busy={busy}
							run={run}
							saveShortcut={saveShortcut}
							refresh={refresh}
							showSources={tab === "layers"}
						/>
					)}
					{tab === "sounds" && <SoundboardSettings info={info} busy={busy} run={run} />}
					{tab === "controls" && (
						<>
							<h2>Ready to record</h2>
							<details className="capture-note">
								<summary>Recommended starting settings</summary>
								<p>
									<strong>Lessons and demos:</strong> one window, microphone and
									computer audio on, a 3-second countdown. These audio and
									countdown defaults apply on a fresh install; your changes are
									remembered.
								</p>
								<p>
									<strong>Voice-only walkthrough:</strong> turn computer audio off
									in the recorder's mic menu. For several apps, choose a whole
									screen or save environments in Layers.
								</p>
								<p>
									<strong>Streaming and calls:</strong> use Sound effects → Stream
									to send your voice and sounds to another app. This optional
									route needs a virtual audio device; recording here does not.
								</p>
								<button
									disabled={busy || info.recording}
									onClick={async () => {
										setBusy(true);
										setError("");
										setResetMessage("");
										try {
											const result =
												await window.electronAPI.studio.request(
													"resetRecordingDefaults",
												);
											saveEditorPreferences({
												autoApplyFreshRecordingAutoZooms: false,
											});
											setInfo(result);
											setAutoZoom(false);
											setResetMessage("Default recording settings restored.");
										} catch (e) {
											setError(e instanceof Error ? e.message : String(e));
										} finally {
											setBusy(false);
										}
									}}
								>
									Reset to default settings
								</button>
								<p>
									Restores microphone and computer audio on, a 3-second countdown,
									soundboard audio included, capture glow on, and automatic click
									zoom off, and the control window hidden from capture. Keeps your
									scenes, media, shortcuts, API keys and existing projects.
								</p>
								{resetMessage && <p role="status">{resetMessage}</p>}
							</details>
							<SoundRecordingOption info={info} disabled={busy} run={run} />
							<p>
								Choose a screen or window in the recorder, check your mic, then
								press Record.
							</p>
							<div className="capture-note">
								Quality adjusts automatically to your source. The countdown and
								audio choices are remembered. The studio is hidden from native Mac
								capture by default. Voice changes are available after recording, in
								the editor.
							</div>
							<div className="shortcut-list">
								{[
									["Show / hide recorder", `${modifier} + Shift + H`],
									["Open / put away whiteboard", `${modifier} + Shift + B`],
									["Start / stop recording", `${modifier} + Shift + R`],
									["Pause / resume", `${modifier} + Shift + P`],
									["Follow cursor while held", "Z (hold)"],
									["Lock zoom / zoom out", "Z (tap)"],
								].map(([label, key]) => (
									<div key={label}>
										<span>{label}</span>
										<kbd>{key}</kbd>
									</div>
								))}
								<div>
									<span>Face camera on / off</span>
									<ShortcutInput
										label="Face camera shortcut"
										value={info.settings.cameraShortcut}
										disabled={busy || info.recording}
										assigned={[
											...info.settings.windows.map((w) => ({
												shortcut: w.shortcut,
												name: `Window ${w.slot}`,
											})),
											...info.settings.sounds.map((s) => ({
												shortcut: s.shortcut,
												name: s.name,
											})),
											...info.settings.scenes.map((s) => ({
												shortcut: s.shortcut,
												name: s.name,
											})),
										]}
										onChange={(shortcut) =>
											saveShortcut("cameraShortcut", shortcut)
										}
									/>
								</div>
							</div>
							<label className="capture-toggle">
								<div>
									<strong>Automatic click-to-zoom</strong>
									<p>
										Off by default. Turn on to add zooms around clicks when a
										new recording opens. Use your zoom shortcut (Z by default)
										or add zooms in the editor for manual control.
									</p>
								</div>
								<input
									type="checkbox"
									checked={autoZoom}
									onChange={(e) => {
										setAutoZoom(e.target.checked);
										saveEditorPreferences({
											autoApplyFreshRecordingAutoZooms: e.target.checked,
										});
									}}
								/>
							</label>
							<label className="capture-toggle">
								<div>
									<strong>Subtle capture glow</strong>
									<p>
										See the active recorded window. The glow stays out of native
										recordings.
									</p>
								</div>
								<input
									type="checkbox"
									checked={info.settings.glow}
									disabled={info.recording || busy}
									onChange={(e) => void run("glow", e.target.checked)}
								/>
							</label>
							<div className="capture-note">
								Hover over a button for three seconds to see what it does. Keyboard
								focus shows the same help.
							</div>
						</>
					)}
					{error && (
						<p className="capture-error" role="alert">
							{error}
						</p>
					)}
					{info.message && !error && (
						<p className="capture-message" role="status">
							{info.message}
						</p>
					)}
				</div>
				<footer className="capture-footer">
					<span className={info.recording ? "recording-indicator" : ""} />
					{info.recording ? "Recording in progress" : "Ready"}
					<span>{info.selectedName}</span>
				</footer>
			</main>
		</SettingsTourProvider>
	);
}
