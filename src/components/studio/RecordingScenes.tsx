import { CameraFrameSettings, SOFT_CAMERA_FRAME } from "./CameraFrameSettings";
import { SceneSources } from "./SceneSources";
import { HelpTarget, SettingHelp } from "../settings-guide/SettingHelp";
import { defaultEnvironmentAudio } from "./environmentAudio";
import { useState } from "react";
import type { RecordingScene, StudioInfo, StudioSource } from "../../types/studio";
import { isCurrentScene } from "./sceneSelection";
import { sourceSwitchUnavailable } from "./sourceSwitching";
import { ShortcutInput } from "./ShortcutInput";

export function RecordingScenes({
	info,
	sources,
	busy,
	run,
	saveShortcut,
	compact = false,
}: {
	compact?: boolean;
	info: StudioInfo;
	sources: StudioSource[];
	busy: boolean;
	run: (method: string, input?: unknown) => Promise<void>;
	saveShortcut: (method: string, input: unknown) => Promise<void>;
}) {
	const [draft, setDraft] = useState<RecordingScene>();
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	const [importing, setImporting] = useState(false);
	const scenes = info.settings.scenes;
	return (
		<HelpTarget id="environments">
			<div className="capture-section-heading">
				<div>
					<h2>
						{compact ? "Scenes" : "Environments"} <SettingHelp id="environments" />
					</h2>
					<p>
						{compact
							? "Click a scene to switch your recording setup."
							: "Organize screen, facecam, media and audio in scenes. Recall with one click or shortcut."}
					</p>
				</div>
				<button
					title="Save a screen or window, camera layout, and audio on/off."
					disabled={busy || importing || saving || info.recording || scenes.length >= 6}
					onClick={() => {
						setError("");
						setDraft({
							id: crypto.randomUUID(),
							name: `Scene ${scenes.length + 1}`,
							source: info.selectedSource ?? sources[0],
							camera: true,
							media: [],
							audio: { ...defaultEnvironmentAudio },
							cameraLayout: { ...info.settings.cameraLayout, ...SOFT_CAMERA_FRAME },
							shortcut: "",
						});
					}}
				>
					+ New scene
				</button>
			</div>
			<details className="scene-help">
				<summary>How scenes work</summary>
				<div className="capture-note">
					MistaRecorda opens on a scene that shares your drawing display, with a blank
					whiteboard (the previous board is kept as board.previous.json). Choose a display
					for drawing or iPad annotations. Window scenes can switch during native macOS
					window recording. New environments start with microphone and computer audio on.
					Start a take with both inputs enabled to mute and restore either while
					switching.
				</div>
			</details>
			{draft && (
				<form
					className="recording-scene-form"
					onSubmit={(e) => {
						e.preventDefault();
						if (saving || importing) return;
						setSaving(true);
						setError("");
						void saveShortcut("saveScene", {
							...draft,
							cameraLayout: draft.cameraLayout ?? info.settings.cameraLayout,
						})
							.then(async () => {
								await saveShortcut("applyScene", draft.id);
								setDraft(undefined);
							})
							.catch((e) => setError(e.message))
							.finally(() => setSaving(false));
					}}
				>
					<fieldset disabled={importing || saving} className="scene-edit-fields">
						<label>
							Name
							<input
								autoFocus
								title="Give this recording setup a short, recognizable name."
								maxLength={60}
								required
								placeholder="e.g. Tutorial with camera"
								value={draft.name}
								onChange={(e) => setDraft({ ...draft, name: e.target.value })}
							/>
						</label>
						<SceneSources
							scene={draft}
							sources={sources}
							change={setDraft}
							onBusy={setImporting}
						/>
						{draft.camera && (
							<div className="scene-layout-editor">
								<CameraFrameSettings
									layout={draft.cameraLayout ?? info.settings.cameraLayout}
									change={(patch) =>
										setDraft({
											...draft,
											cameraLayout: {
												...(draft.cameraLayout ??
													info.settings.cameraLayout),
												...patch,
											},
										})
									}
								/>
								<label>
									Camera position
									<select
										aria-label="Environment camera position"
										value={`${draft.cameraLayout?.x ?? 0.97},${draft.cameraLayout?.y ?? 0.97}`}
										onChange={(e) => {
											const [x, y] = e.target.value.split(",").map(Number);
											setDraft({
												...draft,
												cameraLayout: {
													...(draft.cameraLayout ??
														info.settings.cameraLayout),
													x,
													y,
												},
											});
										}}
									>
										{!["0,0", "1,0", "0,1", "1,1", "0.5,0.5"].includes(
											`${draft.cameraLayout?.x ?? 0.97},${draft.cameraLayout?.y ?? 0.97}`,
										) && (
											<option
												value={`${draft.cameraLayout?.x ?? 0.97},${draft.cameraLayout?.y ?? 0.97}`}
											>
												Custom position
											</option>
										)}
										<option value="0,0">Top left</option>
										<option value="1,0">Top right</option>
										<option value="0,1">Bottom left</option>
										<option value="1,1">Bottom right</option>
										<option value="0.5,0.5">Center</option>
									</select>
								</label>
								<label>
									Camera size
									<input
										aria-label="Environment camera size"
										type="range"
										min="10"
										max="60"
										value={draft.cameraLayout?.size ?? 26}
										onChange={(e) =>
											setDraft({
												...draft,
												cameraLayout: {
													...(draft.cameraLayout ??
														info.settings.cameraLayout),
													size: Number(e.target.value),
												},
											})
										}
									/>
								</label>
								<button
									type="button"
									onClick={() =>
										setDraft({
											...draft,
											cameraLayout: info.settings.cameraLayout,
										})
									}
								>
									Use current camera layout
								</button>
							</div>
						)}

						<div>
							<button
								type="submit"
								title="Save this scene. You can assign its shortcut in the scene list."
								disabled={
									!draft.source ||
									!draft.name.trim() ||
									busy ||
									saving ||
									importing
								}
							>
								{saving ? "Saving…" : "Save & use scene"}
							</button>{" "}
							<button
								type="button"
								title="Discard these scene edits."
								disabled={saving || importing}
								onClick={() => setDraft(undefined)}
							>
								Cancel
							</button>
						</div>
					</fieldset>
				</form>
			)}
			{error && (
				<p role="alert" className="capture-error">
					{error}
				</p>
			)}
			{!scenes.length && !draft && (
				<div className="sound-empty">
					<h3>No scenes yet</h3>
					<p>
						Create a scene with screen, facecam and audio ready to go. Add images,
						videos or music from its Sources menu.
					</p>
				</div>
			)}
			{scenes.map((scene) => {
				const active = isCurrentScene(scene, info);
				const unavailable = sourceSwitchUnavailable(info, scene.source);
				return (
					<div className="recording-scene-row" key={scene.id}>
						<button
							className="scene-description"
							aria-label={`Switch to ${scene.name}`}
							aria-pressed={active}
							disabled={busy || info.switching || !!unavailable}
							title={
								unavailable ||
								"Switch to this source, camera layout and audio setup"
							}
							onClick={() => void run("applyScene", scene.id)}
						>
							<strong>
								{active && (
									<span className="scene-live-dot" aria-label="Current setup" />
								)}{" "}
								{scene.name}
							</strong>
							<small>
								{scene.source.name} · {scene.media?.length ?? 0} media · Camera{" "}
								{scene.camera ? "on" : "off"}
								{scene.audio
									? ` · Mic ${scene.audio.microphone ? "on" : "off"} · Computer ${scene.audio.system ? "on" : "off"}`
									: " · Audio unchanged"}
							</small>
						</button>
						<ShortcutInput
							value={scene.shortcut}
							label={`${scene.name} shortcut`}
							disabled={busy || info.recording}
							assigned={[
								{ shortcut: info.settings.cameraShortcut, name: "Face camera" },
								...info.settings.windows.map((w) => ({
									shortcut: w.shortcut,
									name: `Window ${w.slot}`,
								})),
								...info.settings.sounds.map((s) => ({
									shortcut: s.shortcut,
									name: s.name,
								})),
								...scenes
									.filter((s) => s.id !== scene.id)
									.map((s) => ({ shortcut: s.shortcut, name: s.name })),
							]}
							onChange={(shortcut) =>
								saveShortcut("saveScene", { ...scene, shortcut })
							}
						/>
						<button
							disabled={busy || importing || saving || info.recording}
							title="Edit this environment’s source, camera layout, and audio settings."
							onClick={() => setDraft(scene)}
						>
							Sources & layout
						</button>
						<button
							disabled={busy || info.recording}
							aria-label={`Remove scene ${scene.name}`}
							title="Remove this saved setup and release its shortcut. Recordings are kept."
							onClick={() => void run("removeScene", scene.id)}
						>
							Remove
						</button>
					</div>
				);
			})}
		</HelpTarget>
	);
}
