import {
	GearSixIcon,
	KeyboardIcon,
	MonitorIcon,
	SpeakerHighIcon,
	StackIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import type { StudioInfo, StudioSource } from "../../types/studio";
import { CaptureLayers } from "./CaptureLayers";
import { LayerSources } from "./LayerSources";
import { SoundboardSettings, SoundRecordingOption } from "./SoundboardSettings";
import { isSelectedSource, sourceSwitchUnavailable } from "./sourceSwitching";
import "./studio.css";
import { RecordingScenes } from "./RecordingScenes";
import { ShortcutInput } from "./ShortcutInput";

export { ShortcutInput } from "./ShortcutInput";
export function StudioPanel() {
	const [info, setInfo] = useState<StudioInfo>();
	const modifier = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";
	const [tab, setTab] = useState<import("../../types/studio").StudioTab>("layers");
	const [sources, setSources] = useState<StudioSource[]>([]);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
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
		<main className="capture-studio">
			<header className="capture-heading">
				<GearSixIcon size={17} />
				<h1>Capture settings</h1>
				<span>MistaRecorda</span>
			</header>
			<nav className="capture-tabs" aria-label="Capture settings">
				{(
					[
						{ id: "controls", label: "Recording", Icon: KeyboardIcon },
						{ id: "layers", label: "Layers", Icon: StackIcon },
						{ id: "scenes", label: "Environments", Icon: StackIcon },
						{ id: "windows", label: "Window shortcuts", Icon: MonitorIcon },
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
								layers: "Choose screens and windows, assign shortcuts, and save environments.",
								windows:
									"Assign hotkeys to switch the recorded application window during a take.",
								sounds: "Import sound clips, preview them, and choose hotkeys that add them to your recording.",
								controls: "Recording defaults, camera shortcut, and capture glow.",
								scenes: "Recall a source, camera layout, and audio inputs with one shortcut.",
							}[id]
						}
					>
						<Icon size={18} />
						{label}
					</button>
				))}
			</nav>
			<div className="capture-content">
				{tab === "layers" && (
					<>
						<LayerSources
							info={info}
							sources={sources}
							busy={busy}
							run={run}
							saveShortcut={saveShortcut}
							refresh={refresh}
						/>
						<RecordingScenes
							info={info}
							sources={sources}
							busy={busy}
							run={run}
							saveShortcut={saveShortcut}
						/>
						<CaptureLayers info={info} run={run} />
					</>
				)}
				{tab === "scenes" && (
					<RecordingScenes
						info={info}
						sources={sources}
						busy={busy}
						run={run}
						saveShortcut={saveShortcut}
					/>
				)}
				{tab === "windows" && (
					<>
						<div className="capture-section-heading">
							<div>
								<h2>Window shortcuts</h2>
								<p>
									Save up to six windows or screens. Click a shortcut to edit it;
									click Switch to select its source.
								</p>
							</div>
							<button
								disabled={busy}
								onClick={() => void refresh()}
								title="Refresh the list of currently open application windows."
							>
								Refresh
							</button>
						</div>
						<div className="capture-note">
							{info.canSwitch
								? "Use the Windows button on the recorder to switch saved targets. During a take, start with a window source to switch between windows. Display changes require stopping."
								: "Click a saved source or press its shortcut before recording. Live window switching requires native macOS capture."}
						</div>
						<p className="shortcut-check-note">
							Yellow indicates a known shortcut conflict. Some shortcuts in other apps
							cannot be detected.
						</p>
						{[1, 2, 3, 4, 5, 6].map((slot) => {
							const assigned = info.settings.windows.find((w) => w.slot === slot);
							const selected =
								assigned && isSelectedSource(assigned.source, info.selectedSource);
							const unavailable = assigned
								? sourceSwitchUnavailable(info, assigned.source)
								: "";
							return (
								<div className="window-slot" key={slot}>
									<span className="slot-number">{slot}</span>
									<label>
										Source {slot}
										<select
											aria-label={`Source ${slot}`}
											disabled={busy || info.recording}
											value={assigned?.source.id ?? ""}
											onChange={(e) => {
												const source = sources.find(
													(s) => s.id === e.target.value,
												);
												if (source)
													void run("assignWindow", {
														slot,
														source,
														shortcut:
															assigned?.shortcut ||
															`CommandOrControl+Alt+${slot}`,
													});
											}}
										>
											<option value="">Choose a window or screen…</option>
											{assigned &&
												!sources.some(
													(s) => s.id === assigned.source.id,
												) && (
													<option value={assigned.source.id}>
														{assigned.source.name} (reopen window)
													</option>
												)}
											{sources.map((s) => (
												<option key={s.id} value={s.id}>
													{s.name}
												</option>
											))}
										</select>
									</label>
									<ShortcutInput
										disabled={!assigned || busy || info.recording}
										value={assigned?.shortcut ?? ""}
										label={`Window ${slot} shortcut`}
										assigned={[
											{
												shortcut: info.settings.cameraShortcut,
												name: "Face camera",
											},
											...info.settings.scenes.map((s) => ({
												shortcut: s.shortcut,
												name: s.name,
											})),
											...info.settings.windows
												.filter((w) => w.slot !== slot)
												.map((w) => ({
													shortcut: w.shortcut,
													name: `Window ${w.slot}`,
												})),
											...info.settings.sounds.map((s) => ({
												shortcut: s.shortcut,
												name: s.name,
											})),
										]}
										onChange={async (shortcut) => {
											if (assigned)
												await saveShortcut("assignWindow", {
													...assigned,
													shortcut,
												});
										}}
									/>
									<button
										aria-label={`Switch to window ${slot}`}
										title={
											unavailable ||
											"Switch the recorded source to this window or screen."
										}
										aria-pressed={!!selected}
										disabled={
											!assigned ||
											busy ||
											info.switching ||
											selected ||
											!!unavailable
										}
										onClick={() => void run("switch", slot)}
									>
										{selected ? "Selected" : "Switch"}
									</button>
									<button
										aria-label={`Remove window ${slot}`}
										title="Remove this window assignment and release its hotkey."
										disabled={!assigned || busy || info.recording}
										onClick={() => void run("removeWindow", slot)}
									>
										<TrashIcon size={16} />
									</button>
								</div>
							);
						})}
					</>
				)}
				{tab === "sounds" && <SoundboardSettings info={info} busy={busy} run={run} />}
				{tab === "controls" && (
					<>
						<h2>Ready to record</h2>
						<SoundRecordingOption info={info} disabled={busy} run={run} />
						<p>
							Choose a screen or window in the recorder, check your mic, then press
							Record.
						</p>
						<div className="capture-note">
							Quality adjusts automatically to your source. The countdown and audio
							choices are remembered. Controls hide before capture. Voice changes are
							available after recording, in the editor.
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
	);
}
