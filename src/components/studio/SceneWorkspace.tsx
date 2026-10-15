import { useEffect } from "react";
import type { StudioInfo, StudioSource } from "../../types/studio";
import { CaptureLayers } from "./CaptureLayers";
import { LayerSources } from "./LayerSources";
import { RecordingScenes } from "./RecordingScenes";
import { isSelectedSource } from "./sourceSwitching";

export function SceneWorkspace({
	info,
	sources,
	busy,
	run,
	saveShortcut,
	refresh,
	showSources,
}: {
	info: StudioInfo;
	sources: StudioSource[];
	busy: boolean;
	run: (method: string, input?: unknown) => Promise<void>;
	saveShortcut: (method: string, input: unknown) => Promise<void>;
	refresh: () => Promise<void>;
	showSources: boolean;
}) {
	useEffect(() => {
		let updating = false;
		const timer = setInterval(() => {
			if (document.hidden || updating) return;
			updating = true;
			void refresh().finally(() => {
				updating = false;
			});
		}, 3000);
		return () => clearInterval(timer);
	}, [refresh]);
	const source = sources.find((s) => isSelectedSource(s, info.selectedSource));
	return (
		<div className="scene-workspace">
			<aside className="scene-bank" aria-label="Saved recording scenes">
				<RecordingScenes
					compact
					info={info}
					sources={sources}
					busy={busy}
					run={run}
					saveShortcut={saveShortcut}
				/>
			</aside>
			<section className="scene-inputs" aria-label="Current recording inputs">
				<header>
					<h2>{info.recording ? "Recording now" : "Current setup"}</h2>
					<span className={info.recording ? "scene-recording" : ""}>
						{info.switching ? "Switching…" : info.recording ? "● REC" : "Ready"}
					</span>
				</header>
				<div className="scene-source-preview">
					{source?.thumbnail && source.thumbnail !== "data:image/png;base64," ? (
						<img src={source.thumbnail} alt={`${info.selectedName} source preview`} />
					) : (
						<span>Choose a screen or window below</span>
					)}
				</div>
				<p className="scene-preview-note">Source snapshot · refreshes every 3 seconds</p>
				<ul className="scene-input-list">
					<li>
						<span>Screen / window</span>
						<strong title={info.selectedName}>{info.selectedName}</strong>
					</li>
					<li>
						<span>Face camera</span>
						<button disabled={busy} onClick={() => void run("cameraToggle")}>
							{info.camera?.enabled ? "On · Hide" : "Off · Show"}
						</button>
					</li>
					<li>
						<span>Microphone</span>
						<strong>
							{info.audio ? (info.audio.microphone ? "On" : "Off") : "Check recorder"}
						</strong>
					</li>
					<li>
						<span>Computer audio</span>
						<strong>
							{info.audio ? (info.audio.system ? "On" : "Off") : "Check recorder"}
						</strong>
					</li>
				</ul>
				<p>
					Scenes recall the source, camera layout and audio on/off together. Edit a saved
					scene to change its inputs.
				</p>
			</section>
			<details className="scene-sources-dock" open={showSources}>
				<summary>Screens & windows · click a preview to switch</summary>
				<LayerSources
					info={info}
					sources={sources}
					busy={busy}
					run={run}
					saveShortcut={saveShortcut}
					refresh={refresh}
				/>
			</details>
			<details className="scene-layout-dock">
				<summary>Camera layout & drawing layers</summary>
				<CaptureLayers info={info} run={run} />
			</details>
		</div>
	);
}
