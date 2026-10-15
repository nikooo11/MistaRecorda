import { HelpTarget, SettingHelp } from "../settings-guide/SettingHelp";
import { defaultEnvironmentAudio } from "./environmentAudio";
import { useState } from "react";
import type { RecordingScene, StudioInfo, StudioSource } from "../../types/studio";
import { ShortcutInput } from "./ShortcutInput";

export function RecordingScenes({
	info,
	sources,
	busy,
	run,
	saveShortcut,
}: {
	info: StudioInfo;
	sources: StudioSource[];
	busy: boolean;
	run: (method: string, input?: unknown) => Promise<void>;
	saveShortcut: (method: string, input: unknown) => Promise<void>;
}) {
	const [draft, setDraft] = useState<RecordingScene>();
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	const scenes = info.settings.scenes;
	return (
		<HelpTarget id="environments">
			<div className="capture-section-heading">
				<div>
					<h2>
						Environments <SettingHelp id="environments" />
					</h2>
					<p>
						Save a source, camera layout, and audio inputs. Recall with one click or
						shortcut.
					</p>
				</div>
				<button
					title="Save a screen or window, camera layout, and audio on/off."
					disabled={busy || info.recording || scenes.length >= 6}
					onClick={() => {
						setError("");
						setDraft({
							id: crypto.randomUUID(),
							name: "",
							source: info.selectedSource ?? sources[0],
							camera: info.camera?.enabled ?? false,
							audio: { ...defaultEnvironmentAudio },
							cameraLayout: info.settings.cameraLayout,
							shortcut: "",
						});
					}}
				>
					Save current setup
				</button>
			</div>
			<div className="capture-note">
				Choose a display for drawing or iPad annotations. Window scenes can switch during
				native macOS window recording. New environments start with microphone and computer
				audio on. Start a take with both inputs enabled to mute and restore either while
				switching.
			</div>
			{draft && (
				<form
					className="recording-scene-form"
					onSubmit={(e) => {
						e.preventDefault();
						if (saving) return;
						setSaving(true);
						setError("");
						void saveShortcut("saveScene", {
							...draft,
							cameraLayout: draft.cameraLayout ?? info.settings.cameraLayout,
						})
							.then(() => setDraft(undefined))
							.catch((e) => setError(e.message))
							.finally(() => setSaving(false));
					}}
				>
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
					<label>
						Source
						<select
							title="Choose the display or application window this scene records."
							required
							value={draft.source?.id ?? ""}
							onChange={(e) => {
								const source = sources.find((s) => s.id === e.target.value);
								if (source) setDraft({ ...draft, source });
							}}
						>
							<option value="">Choose a screen or window…</option>
							{draft.source && !sources.some((s) => s.id === draft.source.id) && (
								<option value={draft.source.id}>
									{draft.source.name} (unavailable)
								</option>
							)}
							{sources.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name}
								</option>
							))}
						</select>
					</label>
					<label className="scene-camera">
						<input
							type="checkbox"
							title="Turn the selected face camera on when this scene is used. Leave off for screen-only scenes."
							checked={draft.camera}
							onChange={(e) => setDraft({ ...draft, camera: e.target.checked })}
						/>
						Face camera
					</label>
					<div className="scene-audio-controls">
						{(["microphone", "system"] as const).map((key) => (
							<label key={key}>
								<input
									type="checkbox"
									checked={draft.audio?.[key] ?? true}
									onChange={(e) =>
										setDraft({
											...draft,
											audio: {
												microphone: draft.audio?.microphone ?? true,
												system: draft.audio?.system ?? true,
												[key]: e.target.checked,
											},
										})
									}
								/>
								{key === "microphone" ? "Microphone" : "Computer audio"}
							</label>
						))}
					</div>
					{draft.camera && (
						<div className="scene-layout-editor">
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
									setDraft({ ...draft, cameraLayout: info.settings.cameraLayout })
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
							disabled={!draft.source || !draft.name.trim() || busy || saving}
						>
							{saving ? "Saving…" : "Save environment"}
						</button>{" "}
						<button
							type="button"
							title="Discard these scene edits."
							disabled={saving}
							onClick={() => setDraft(undefined)}
						>
							Cancel
						</button>
					</div>
				</form>
			)}
			{error && (
				<p role="alert" className="capture-error">
					{error}
				</p>
			)}
			{!scenes.length && !draft && (
				<div className="sound-empty">
					<h3>No saved environments yet</h3>
					<p>Set up your source and camera, then save an environment you use often.</p>
				</div>
			)}
			{scenes.map((scene) => (
				<div className="recording-scene-row" key={scene.id}>
					<div className="scene-description">
						<strong>{scene.name}</strong>
						<small>
							{scene.source.name} · Camera {scene.camera ? "on" : "off"}
							{scene.audio
								? ` · Mic ${scene.audio.microphone ? "on" : "off"} · Computer ${scene.audio.system ? "on" : "off"}`
								: " · Audio unchanged"}
						</small>
					</div>
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
						onChange={(shortcut) => saveShortcut("saveScene", { ...scene, shortcut })}
					/>
					<button
						disabled={busy || info.switching}
						title="Apply this source, camera layout, and audio settings."
						onClick={() => void run("applyScene", scene.id)}
					>
						Switch
					</button>
					<button
						disabled={busy || info.recording}
						title="Edit this environment’s source, camera layout, and audio settings."
						onClick={() => setDraft(scene)}
					>
						Edit
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
			))}
		</HelpTarget>
	);
}
