import { useCallback, useEffect, useState } from "react";
import {
	GearSixIcon,
	PencilSimpleIcon,
	DeviceTabletIcon,
	MicrophoneIcon,
	MicrophoneSlashIcon,
	MonitorIcon,
	TimerIcon,
	VideoCameraIcon,
	VideoCameraSlashIcon,
	MinusIcon,
	ArrowClockwiseIcon,
	PauseIcon,
	PlayIcon,
	RecordIcon,
	StopIcon,
	FolderOpenIcon,
	SpeakerHighIcon,
} from "@phosphor-icons/react";
import type { useScreenRecorder } from "../../hooks/useScreenRecorder";
import type { useLaunchWindowActions } from "./hooks/useLaunchWindowActions";
import { useMicrophoneDevices } from "../../hooks/useMicrophoneDevices";
import { useVideoDevices } from "../../hooks/useVideoDevices";
import type { StudioInfo, StudioSource } from "../../types/studio";
import { WindowHeader } from "../ui/WindowHeader";
import { RecordingScenes } from "../studio/RecordingScenes";
import { LayerSources } from "../studio/LayerSources";
import { formatShortcut } from "../studio/shortcuts";
import { RecordingZoomControl } from "../recording-zoom/RecordingZoomSettings";
import "../studio/studio.css";
import "./recordingStudio.css";

type Props = {
	recorder: ReturnType<typeof useScreenRecorder>;
	actions: ReturnType<typeof useLaunchWindowActions>;
	platform: string;
	elapsed: string;
};
export function RecordingStudio({ recorder: r, actions, platform, elapsed }: Props) {
	const [info, setInfo] = useState<StudioInfo>();
	const [sources, setSources] = useState<StudioSource[]>([]);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [tab, setTab] = useState<"scenes" | "sources">("scenes");
	const [countdown, setCountdown] = useState<number | null>(null);
	const [discard, setDiscard] = useState(false);
	const [library, setLibrary] = useState(false);
	const mic = useMicrophoneDevices(r.microphoneEnabled, r.microphoneDeviceId);
	const cam = useVideoDevices(r.webcamEnabled);
	const mac = platform === "darwin";
	const shortcut = (key: string) => formatShortcut(`CommandOrControl+Shift+${key}`, mac);
	const save = useCallback(async (method: string, input?: unknown) => {
		const result = await window.electronAPI.studio.request(method, input);
		setInfo(result);
		setError("");
	}, []);
	const run = useCallback(
		async (method: string, input?: unknown) => {
			setBusy(true);
			try {
				await save(method, input);
			} catch (e) {
				setError(String(e instanceof Error ? e.message : e));
			} finally {
				setBusy(false);
			}
		},
		[save],
	);
	const refresh = useCallback(async () => {
		try {
			const all = await window.electronAPI.getSources({
				types: ["window", "screen"],
				thumbnailSize: { width: 960, height: 600 },
				fetchWindowIcons: true,
			});
			setSources(all as StudioSource[]);
		} catch (e) {
			setError(String(e));
		}
	}, []);
	useEffect(() => {
		void run("info");
		void refresh();
		const stop = window.electronAPI.studio.onChanged(setInfo);
		const changed = window.electronAPI.onSelectedSourceChanged(() => {
			void run("info");
			void refresh();
		});
		const ticks = window.electronAPI.onCountdownTick(setCountdown);
		return () => {
			stop();
			changed?.();
			ticks?.();
		};
	}, [run, refresh]);
	useEffect(() => {
		if (!r.countdownActive) setCountdown(null);
	}, [r.countdownActive]);
	useEffect(() => {
		if (!r.recording) setDiscard(false);
	}, [r.recording]);
	const source = sources.find((s) => s.id === info?.selectedSource?.id) ?? info?.selectedSource;
	const locked = r.recording || r.starting || r.countdownActive || r.finalizing;
	const state = r.finalizing
		? "Saving recording…"
		: r.countdownActive
			? "Starting soon"
			: r.paused
				? "Paused"
				: r.recording
					? "Recording"
					: "Ready to record";
	return (
		<main className="capture-studio recording-studio">
			<WindowHeader className="capture-heading">
				<h1>Recording studio</h1>
				<span className="studio-state" data-recording={r.recording && !r.paused}>
					<i />
					{state}
				</span>
				<button
					title={`Minimize studio — restore with ${shortcut("H")}`}
					aria-label="Minimize recording studio"
					onClick={() => window.electronAPI.hudOverlayHide()}
				>
					<MinusIcon size={18} />
				</button>
			</WindowHeader>
			<nav className="studio-tools" aria-label="Recording tools">
				<RecordingZoomControl />
				<button
					onClick={() => void window.electronAPI.board.request("toggleBoard")}
					title={`Show or hide whiteboard · ${shortcut("B")}`}
				>
					<PencilSimpleIcon size={18} /> Board
				</button>
				<button
					data-help="Open iPad pairing in a separate window. Scan the QR code and approve the connection on your Mac to control drawings, media and presenter tools. Click again to close the panel."
					onClick={() =>
						void window.electronAPI.board.request("togglePanel", { tab: "ipad" })
					}
				>
					<DeviceTabletIcon size={18} /> iPad
				</button>
				<button
					data-help="Open sound effects and voice cues in a separate window. Click again to close it. Sounds can be included in the recording or kept as editable clips."
					onClick={() => void run("togglePanel", "sounds")}
				>
					<SpeakerHighIcon size={18} /> Sounds
				</button>
				<button
					data-help="Open recording preferences, shortcuts, scenes and API Setup in a separate window. Click again to close Settings while the recording studio stays open."
					onClick={() => void run("togglePanel", "controls")}
				>
					<GearSixIcon size={18} /> Settings
				</button>
				<span className="studio-toolbar-spacer" />
				<button
					data-help="Open an existing recording or saved project in the editor. Finish the current take before opening another project."
					disabled={locked}
					onClick={() => {
						setLibrary(!library);
						void actions.refreshProjectLibrary();
					}}
				>
					<FolderOpenIcon size={18} /> Projects
				</button>
			</nav>
			<aside className="studio-sources">
				<nav className="studio-section-tabs" aria-label="Scene and source panels">
					<button
						data-help="Save a screen or window, facecam layout, media and audio choices as a scene. Switch scenes with one click or an assigned shortcut."
						aria-pressed={tab === "scenes"}
						onClick={() => setTab("scenes")}
					>
						Scenes
					</button>
					<button
						data-help="Choose which open window or display to capture. A window recording follows that window; a display recording includes the whole screen."
						aria-pressed={tab === "sources"}
						onClick={() => setTab("sources")}
					>
						Screens & windows
					</button>
				</nav>
				<div className="studio-source-scroll">
					{info &&
						(tab === "scenes" ? (
							<RecordingScenes
								info={info}
								sources={sources}
								busy={busy || r.starting || r.countdownActive || r.finalizing}
								run={run}
								saveShortcut={save}
								compact
							/>
						) : (
							<LayerSources
								info={info}
								sources={sources}
								busy={busy || r.starting || r.countdownActive || r.finalizing}
								run={run}
								saveShortcut={save}
								refresh={refresh}
							/>
						))}
					{!info && <p>{error || "Loading your setup…"}</p>}
				</div>
			</aside>
			<section className="studio-preview-area" aria-label="Selected recording source">
				<div className="studio-preview-heading">
					<div>
						<span className="studio-eyebrow">
							{r.recording ? "RECORDING SOURCE" : "SELECTED SOURCE"}
						</span>
						<h2>{info?.selectedName || actions.selectedSource || "Choose a source"}</h2>
					</div>
					<button
						aria-label="Refresh source preview"
						title="Refresh source snapshot"
						onClick={() => void refresh()}
					>
						<ArrowClockwiseIcon size={16} />
					</button>
				</div>
				<div className="studio-preview" data-recording={r.recording}>
					{source?.thumbnail ? (
						<img src={source.thumbnail} alt={`Snapshot of ${source.name}`} />
					) : (
						<div className="studio-preview-empty">
							<MonitorIcon size={44} />
							<h2>Start with your screen</h2>
							<p>Choose a screen or window from Sources.</p>
						</div>
					)}
					{r.countdownActive && (
						<div className="studio-countdown" role="status">
							<strong>{countdown ?? r.countdownDelay}</strong>
							<span>Get ready</span>
							<button onClick={() => void window.electronAPI.cancelCountdown()}>
								Cancel countdown
							</button>
						</div>
					)}
				</div>
				<div className="studio-preview-caption">
					<span>Source snapshot · refresh to update</span>
					<span>
						{source?.sourceType === "window"
							? "Window capture"
							: source
								? "Display capture"
								: "No source selected"}
					</span>
				</div>
				<div className="studio-workflow-note">
					<button
						title="Drawing tools, memes, images and presenter notes"
						onClick={() =>
							void window.electronAPI.board.request("togglePanel", { tab: "draw" })
						}
					>
						<PencilSimpleIcon size={18} /> Drawing tools
					</button>
					<p>
						Use Board or your iPad to present. The capture glow shows the active window.
						This studio stays out of your recording.
					</p>
				</div>
				{library && (
					<section className="studio-projects" aria-label="Recent projects">
						<h2>Recent projects</h2>
						<button onClick={() => void actions.openVideoFile()}>
							Open recording or project…
						</button>
						{actions.projectLibraryEntries.map((entry) => (
							<button
								key={entry.path}
								onClick={() => void actions.openProjectFromLibrary(entry.path)}
							>
								{entry.name}
							</button>
						))}
					</section>
				)}
			</section>
			<aside className="studio-controls" aria-label="Recording controls">
				<span className="studio-eyebrow">{state}</span>
				<div className="studio-clock" aria-live="off">
					{elapsed}
				</div>
				<button
					className="studio-record"
					data-help="Start recording the selected scene after the countdown. Click again to stop and open your take in the editor."
					disabled={
						r.finalizing ||
						r.countdownActive ||
						(!r.recording && !actions.hasSelectedSource)
					}
					onClick={() => void r.toggleRecording()}
				>
					{r.recording ? (
						<StopIcon size={24} weight="fill" />
					) : (
						<RecordIcon size={26} weight="fill" />
					)}
					<span>
						{r.finalizing
							? "Saving…"
							: r.recording
								? "Stop recording"
								: "Start recording"}
						<kbd>{shortcut("R")}</kbd>
					</span>
				</button>
				<button
					className="studio-pause"
					data-help="Pause without ending this take. Paused time is left out of the saved video, and scene media pauses too. Click Resume when ready."
					disabled={!r.recording || r.finalizing}
					onClick={r.paused ? r.resumeRecording : r.pauseRecording}
				>
					{r.paused ? <PlayIcon size={18} /> : <PauseIcon size={18} />}{" "}
					{r.paused ? "Resume" : "Pause"}
					<kbd>{shortcut("P")}</kbd>
				</button>
				<label className="studio-countdown-setting">
					<TimerIcon size={17} /> Start after
					<select
						aria-label="Countdown before recording"
						data-help="Wait this many seconds before recording starts. Three seconds gives you time to prepare; choose No countdown for an immediate start."
						disabled={locked}
						value={r.countdownDelay}
						onChange={(e) => r.setCountdownDelay(Number(e.target.value))}
					>
						{[0, 3, 5, 10].map((n) => (
							<option key={n} value={n}>
								{n ? `${n} seconds` : "No countdown"}
							</option>
						))}
					</select>
				</label>
				<hr />
				<button
					className="studio-input-toggle"
					data-help="Show your face camera on screen and in the recording. Drag it on your desktop to reposition it. Right-click it or use its shortcut to hide it during a take."
					aria-pressed={r.webcamEnabled}
					onClick={() => r.setWebcamEnabled(!r.webcamEnabled)}
					disabled={r.starting || r.countdownActive || r.finalizing}
				>
					{r.webcamEnabled ? (
						<VideoCameraIcon size={20} />
					) : (
						<VideoCameraSlashIcon size={20} />
					)}{" "}
					Facecam<span>{r.webcamEnabled ? "On" : "Off"}</span>
				</button>
				<kbd className="studio-camera-shortcut">
					{info && formatShortcut(info.settings.cameraShortcut, mac)}
				</kbd>
				<details className="studio-device-details">
					<summary data-help="Choose your camera before recording. Open layout settings to set its size, border, shadow and show/hide shortcut.">
						Camera device & layout
					</summary>
					<select
						aria-label="Facecam device"
						data-help="Choose the camera to use for your facecam. Select a connected webcam here before recording."
						value={r.webcamDeviceId ?? "default"}
						disabled={locked}
						onChange={(e) => {
							cam.setSelectedDeviceId(e.target.value);
							r.setWebcamDeviceId(
								e.target.value === "default" ? undefined : e.target.value,
							);
						}}
					>
						<option value="default">Default camera</option>
						{cam.devices
							.filter((d) => d.deviceId !== "default")
							.map((d) => (
								<option key={d.deviceId} value={d.deviceId}>
									{d.label}
								</option>
							))}
					</select>
					<p>
						Drag the facecam on your desktop. Right-click it to hide, or use its
						shortcut.
					</p>
					<button
						data-help="Open facecam size, border and shadow controls, plus the shortcut for showing and hiding it during a take."
						onClick={() => void run("togglePanel", "layers")}
					>
						Facecam layout & shortcuts
					</button>
				</details>
				<hr />
				<h2>Inputs</h2>
				<button
					className="studio-input-toggle"
					data-help="Record your voice from the selected microphone. Turn it off for silent demos. Use headphones when playing media so the microphone does not record speaker playback again."
					aria-pressed={r.microphoneEnabled}
					onClick={() => r.setMicrophoneEnabled(!r.microphoneEnabled)}
					disabled={r.starting || r.countdownActive || r.finalizing}
				>
					{r.microphoneEnabled ? (
						<MicrophoneIcon size={20} />
					) : (
						<MicrophoneSlashIcon size={20} />
					)}{" "}
					Microphone<span>{r.microphoneEnabled ? "On" : "Off"}</span>
				</button>
				<select
					aria-label="Microphone device"
					data-help="Choose the microphone that records your voice. A headset or USB microphone is useful for clear narration; Default microphone follows your computer’s selection."
					value={r.microphoneDeviceId ?? "default"}
					disabled={locked}
					onChange={(e) => {
						mic.setSelectedDeviceId(e.target.value);
						r.setMicrophoneDeviceId(
							e.target.value === "default" ? undefined : e.target.value,
						);
					}}
				>
					<option value="default">Default microphone</option>
					{mic.devices
						.filter((d) => d.deviceId !== "default")
						.map((d) => (
							<option key={d.deviceId} value={d.deviceId}>
								{d.label}
							</option>
						))}
				</select>
				<button
					className="studio-input-toggle"
					data-help="Record audio from apps on your computer, such as a video, music or game. Turn it off for a voice-only walkthrough. This is separate from your microphone. Start with it on if you want to mute and restore it during the take."
					aria-pressed={r.systemAudioEnabled}
					onClick={() => r.setSystemAudioEnabled(!r.systemAudioEnabled)}
					disabled={r.starting || r.countdownActive || r.finalizing}
				>
					<MonitorIcon size={20} /> Computer audio
					<span>{r.systemAudioEnabled ? "On" : "Off"}</span>
				</button>
				<hr />
				{r.recording && (
					<div className="studio-discard">
						{discard ? (
							<>
								<p>Discard this entire take?</p>
								<button
									onClick={() => {
										r.cancelRecording();
										setDiscard(false);
									}}
								>
									Discard take
								</button>
								<button onClick={() => setDiscard(false)}>Keep recording</button>
							</>
						) : (
							<button onClick={() => setDiscard(true)}>Discard take…</button>
						)}
					</div>
				)}
			</aside>
			<footer className="studio-footer">
				<span role={error ? "alert" : "status"}>
					{error ||
						(r.paused
							? "Recording paused. Resume when you are ready."
							: r.recording
								? "Recording continues when the studio is minimized."
								: "Ready when you are. Choose a source, then start recording.")}
				</span>
				<span>{shortcut("H")} · Show / hide studio</span>
			</footer>
		</main>
	);
}
