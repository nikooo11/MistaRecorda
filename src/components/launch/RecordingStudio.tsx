import { useCallback, useEffect, useState } from "react";
import {
	SparkleIcon,
	WaveformIcon,
	GearSixIcon,
	SquaresFourIcon,
	SlidersHorizontalIcon,
	PencilSimpleIcon,
	DeviceTabletIcon,
	MonitorIcon,
	MicrophoneIcon,
	MicrophoneSlashIcon,
	TimerIcon,
	VideoCameraIcon,
	VideoCameraSlashIcon,
	MinusIcon,
	PauseIcon,
	PlayIcon,
	RecordIcon,
	StopIcon,
	FilmStripIcon,
	FolderOpenIcon,
	SpeakerHighIcon,
	ImageIcon,
	ListBulletsIcon,
} from "@phosphor-icons/react";
import { useAudioLevelMeter } from "../../hooks/useAudioLevelMeter";
import type { useScreenRecorder } from "../../hooks/useScreenRecorder";
import type { useLaunchWindowActions } from "./hooks/useLaunchWindowActions";
import { useMicrophoneDevices } from "../../hooks/useMicrophoneDevices";
import { useVideoDevices } from "../../hooks/useVideoDevices";
import type { StudioInfo, StudioSource } from "../../types/studio";
import { LiveScenePreview } from "../studio/LiveScenePreview";
import { SceneSourceDock } from "../studio/SceneSourceDock";
import { useCurrentSceneMedia } from "../studio/useCurrentSceneMedia";
import { WindowHeader } from "../ui/WindowHeader";
import { RecordingScenes } from "../studio/RecordingScenes";
import { LayerSources } from "../studio/LayerSources";
import { formatShortcut } from "../studio/shortcuts";
import { RecordingZoomControl } from "../recording-zoom/RecordingZoomSettings";
import { ApiKeyWarnings } from "../studio/ApiKeyWarnings";
import "../studio/studio.css";
import "./recordingStudio.css";

type Props = {
	recorder: ReturnType<typeof useScreenRecorder>;
	actions: ReturnType<typeof useLaunchWindowActions>;
	platform: string;
	elapsed: string;
};
function StudioMicMeter({ enabled, deviceId }: { enabled: boolean; deviceId?: string }) {
	const { level } = useAudioLevelMeter({ enabled, deviceId });
	return (
		<div
			className="studio-mic-monitor"
			data-help="Live level from the selected microphone. Speak at your normal volume to check that sound is reaching the app. This display does not change your recording volume."
		>
			<div
				className="studio-meter"
				role="meter"
				aria-label="Microphone input level"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(level)}
			>
				<span style={{ width: `${level}%` }} />
			</div>
			<small>{enabled ? "Microphone input" : "Microphone off"}</small>
		</div>
	);
}
export function RecordingStudio({ recorder: r, actions, platform, elapsed }: Props) {
	const [info, setInfo] = useState<StudioInfo>();
	const [selectedLayer, setSelectedLayer] = useState<string>();
	const layers = useCurrentSceneMedia(info, setInfo);
	const [sources, setSources] = useState<StudioSource[]>([]);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [tab, setTab] = useState<"scenes" | "sources">("scenes");
	const [countdown, setCountdown] = useState<number | null>(null);
	const [discard, setDiscard] = useState(false);
	const [library, setLibrary] = useState(false);
	const [clipPending, setClipPending] = useState(false);
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
		void window.electronAPI.clips
			.status()
			.then((s) => setClipPending(s.pending))
			.catch(() => undefined);
		return window.electronAPI.clips.onPendingChanged(setClipPending);
	}, []);
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
			<ApiKeyWarnings />
			<nav className="studio-tools studio-dock" aria-label="Recording tools">
				<h2 className="studio-dock-title">
					<SquaresFourIcon size={15} /> Presenter tools
				</h2>
				<div className="studio-tool-grid">
					<RecordingZoomControl />
					<button
						data-help="Edit talking points on your Mac, then Save points to sync them to your connected iPad. Notes stay off the recording."
						onClick={() => void window.electronAPI.board.request("openNotes")}
					>
						<ListBulletsIcon size={18} /> Notes
					</button>
					<button
						data-help="Open the AI figure assistant. Choose Listen to ask for links, images and presentation ideas from what you say. Nothing is sent to OpenAI until you request it."
						onClick={() => void window.electronAPI.board.request("openPresenter", "ai")}
					>
						<SparkleIcon size={18} /> AI mic
					</button>
					<button
						data-help="Choose an ElevenLabs voice for recorded narration. Voice cues stay editable in the editor. Manage your API key in Settings → Setup."
						onClick={() =>
							void window.electronAPI.board.request("openPresenter", "voices")
						}
					>
						<WaveformIcon size={18} /> Voices
					</button>
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
						title="Open memes and presentation objects"
						onClick={() => void window.electronAPI.board.request("openMemes")}
					>
						<ImageIcon size={18} /> Memes
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
					<button
						title="Drawing tools, memes, images and presenter notes"
						onClick={() =>
							void window.electronAPI.board.request("togglePanel", { tab: "draw" })
						}
					>
						<PencilSimpleIcon size={18} /> Drawing tools
					</button>
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
				</div>
			</nav>
			<aside className="studio-sources">
				<section className="studio-scenes-dock studio-dock" aria-label="Scenes">
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
									busy={
										busy ||
										layers.saving ||
										r.starting ||
										r.countdownActive ||
										r.finalizing
									}
									run={run}
									saveShortcut={save}
									compact
								/>
							) : (
								<LayerSources
									info={info}
									sources={sources}
									busy={
										busy ||
										layers.saving ||
										r.starting ||
										r.countdownActive ||
										r.finalizing
									}
									run={run}
									saveShortcut={save}
									refresh={refresh}
								/>
							))}
						{!info && <p>{error || "Loading your setup…"}</p>}
					</div>
				</section>
				<div className="studio-layer-dock studio-dock">
					{info && (
						<SceneSourceDock
							info={info}
							media={layers.media}
							change={layers.change}
							selected={selectedLayer}
							select={setSelectedLayer}
							busy={busy || r.starting || r.countdownActive || r.finalizing}
							error={layers.error}
						/>
					)}
				</div>
			</aside>
			<section className="studio-preview-area" aria-label="Selected recording source">
				{clipPending && (
					<div className="studio-clip-banner" role="status">
						<FilmStripIcon size={18} />
						<p>
							{r.recording || r.finalizing
								? "This take will be added to the end of your project."
								: "Record a clip to add to the end of your project."}
						</p>
						{!locked && (
							<button onClick={() => void window.electronAPI.clips.cancel()}>
								Back to editor
							</button>
						)}
					</div>
				)}
				<div className="studio-preview-heading">
					<div>
						<span className="studio-eyebrow">
							{r.recording ? "RECORDING SOURCE" : "SELECTED SOURCE"}
						</span>
						<h2>{info?.selectedName || actions.selectedSource || "Choose a source"}</h2>
					</div>
				</div>
				<div className="studio-preview" data-recording={r.recording}>
					<LiveScenePreview
						info={info}
						selected={layers.media.find((s) => s.id === selectedLayer)}
						onTransform={(patch) =>
							void layers.change(
								layers.media.map((s) =>
									s.id === selectedLayer ? { ...s, ...patch } : s,
								),
							)
						}
					/>
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
					<span>Your recording composition</span>
					<span>
						{source?.sourceType === "window"
							? "Window capture"
							: source
								? "Display capture"
								: "No source selected"}
					</span>
				</div>
				<label
					className="studio-capture-visibility"
					data-help="Off by default: hides this control window from MistaRecorda display recordings and screen stills. Turn on to demonstrate the app. Other apps using macOS ScreenCaptureKit may ignore screenshot protection. This does not add the studio over a different captured application window."
				>
					<input
						type="checkbox"
						checked={info?.settings.showStudioInCapture ?? false}
						disabled={busy}
						onChange={(e) => void run("showStudioInCapture", e.target.checked)}
					/>{" "}
					Show window in recording
				</label>
				{info?.urlPresentation && (
					<div className="studio-url-presentation" role="status">
						<span>
							Presenting Chrome · return to {info.urlPresentation.previousName}
						</span>
						<button disabled={busy} onClick={() => void run("endURLPresentation")}>
							Return to scene
						</button>
						<small>The Chrome tab stays open.</small>
					</div>
				)}

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
			<section className="studio-audio studio-dock" aria-label="Audio and camera">
				<h2 className="studio-dock-title">
					<SlidersHorizontalIcon size={15} /> Audio & camera
				</h2>
				<div className="studio-dock-body">
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
					<StudioMicMeter enabled={r.microphoneEnabled} deviceId={r.microphoneDeviceId} />
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
				</div>
			</section>
			<aside className="studio-controls studio-dock" aria-label="Recording controls">
				<h2 className="studio-dock-title">
					<RecordIcon size={15} /> Controls
				</h2>
				<div className="studio-dock-body">
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
									<button onClick={() => setDiscard(false)}>
										Keep recording
									</button>
								</>
							) : (
								<button onClick={() => setDiscard(true)}>Discard take…</button>
							)}
						</div>
					)}
				</div>
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
