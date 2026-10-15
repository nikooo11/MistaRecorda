import { LayerSources } from "./LayerSources";
import { isSelectedSource, sourceSwitchUnavailable } from "./sourceSwitching";
import { CaptureLayers } from "./CaptureLayers";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	GearSixIcon,
	KeyboardIcon,
	MonitorIcon,
	SpeakerHighIcon,
	PlusIcon,
	PlayIcon,
	TrashIcon,
	StopIcon,
	StackIcon,
} from "@phosphor-icons/react";
import type { StudioInfo, StudioSource, SoundEffect } from "../../types/studio";
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
	const [playing, setPlaying] = useState("");
	const audio = useRef<HTMLAudioElement>();
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
	useEffect(() => () => audio.current?.pause(), []);
	useEffect(() => {
		if (info?.panelTab) setTab(info.panelTab);
	}, [info?.panelTab]);
	const preview = async (sound: SoundEffect) => {
		audio.current?.pause();
		if (playing === sound.id) {
			setPlaying("");
			return;
		}
		try {
			const path = await window.electronAPI.studio.request<string>("soundPath", sound.id);
			const result = await window.electronAPI.getLocalMediaUrl(path);
			if (!result.success) throw Error("Could not open sound.");
			const player = new Audio(result.url);
			audio.current = player;
			player.volume = Math.min(1, sound.volume);
			player.onended = () => setPlaying("");
			await player.play();
			setPlaying(sound.id);
		} catch (e) {
			setError((e as Error).message);
		}
	};
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
				{tab === "sounds" && (
					<>
						<div className="capture-section-heading">
							<div>
								<h2>Sound effects</h2>
								<p>
									Import audio and assign a shortcut to insert it during
									recording.
								</p>
							</div>
							<button
								className="capture-primary"
								disabled={busy || info.recording}
								onClick={() => void run("importSound")}
								title="Import a WAV, MP3, M4A, OGG, FLAC, or AAC clip up to 25 MB and two minutes. A local copy is kept by the app."
							>
								<PlusIcon size={17} /> Import sound
							</button>
						</div>
						<div className="capture-note">
							Effects remain editable in the timeline and are included in playback and
							export.
						</div>
						{!info.settings.sounds.length && (
							<div className="sound-empty">
								<h3>No sound effects</h3>
								<p>Import a WAV, MP3, M4A, OGG, FLAC, or AAC file to begin.</p>
							</div>
						)}
						{info.settings.sounds.map((sound) => (
							<div className="sound-card" key={sound.id}>
								<button
									className="sound-preview"
									aria-label={`${playing === sound.id ? "Stop" : "Preview"} ${sound.name}`}
									title="Listen to this effect before recording. Click again to stop."
									disabled={info.recording}
									onClick={() => void preview(sound)}
								>
									{playing === sound.id ? (
										<StopIcon size={20} weight="fill" />
									) : (
										<PlayIcon size={20} weight="fill" />
									)}
								</button>
								<div className="sound-name">
									<strong>{sound.name}</strong>
									<small>
										{(sound.durationMs / 1000).toFixed(1)} seconds · WAV
									</small>
								</div>
								<ShortcutInput
									value={sound.shortcut}
									disabled={busy || info.recording}
									label={`${sound.name} shortcut`}
									assigned={[
										{
											shortcut: info.settings.cameraShortcut,
											name: "Face camera",
										},
										...info.settings.scenes.map((s) => ({
											shortcut: s.shortcut,
											name: s.name,
										})),
										...info.settings.windows.map((w) => ({
											shortcut: w.shortcut,
											name: `Window ${w.slot}`,
										})),
										...info.settings.sounds
											.filter((s) => s.id !== sound.id)
											.map((s) => ({ shortcut: s.shortcut, name: s.name })),
									]}
									onChange={(shortcut) =>
										saveShortcut("updateSound", { ...sound, shortcut })
									}
								/>
								<label className="sound-volume">
									Volume{" "}
									<input
										type="range"
										aria-label={`${sound.name} volume`}
										min="0"
										max="2"
										step=".05"
										disabled={info.recording}
										value={sound.volume}
										onChange={(e) =>
											setInfo({
												...info,
												settings: {
													...info.settings,
													sounds: info.settings.sounds.map((s) =>
														s.id === sound.id
															? {
																	...s,
																	volume: Number(e.target.value),
																}
															: s,
													),
												},
											})
										}
										onPointerUp={(e) =>
											void run("updateSound", {
												...sound,
												volume: Number(e.currentTarget.value),
											})
										}
										onKeyUp={(e) =>
											void run("updateSound", {
												...sound,
												volume: Number(e.currentTarget.value),
											})
										}
									/>
								</label>
								<button
									disabled={!info.recording || busy}
									onClick={() => void run("fireSound", sound.id)}
									title="Add this sound to the current take at the current recording time."
								>
									Trigger
								</button>
								<button
									aria-label={`Remove ${sound.name}`}
									disabled={info.recording || busy}
									onClick={() => void run("removeSound", sound.id)}
									title="Remove this effect from the sound pad. Existing recordings keep their own copies."
								>
									<TrashIcon size={17} />
								</button>
							</div>
						))}
					</>
				)}
				{tab === "controls" && (
					<>
						<h2>Ready to record</h2>
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
