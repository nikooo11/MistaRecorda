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
		<>
			<div className="capture-section-heading">
				<div>
					<h2>Recording scenes</h2>
					<p>A source and camera setup, recalled with one shortcut.</p>
				</div>
				<button
					title="Save a reusable screen or window source with face camera on or off."
					disabled={busy || info.recording || scenes.length >= 6}
					onClick={() => {
						setError("");
						setDraft({
							id: crypto.randomUUID(),
							name: "",
							source: sources[0],
							camera: false,
							shortcut: "",
						});
					}}
				>
					Add scene
				</button>
			</div>
			<div className="capture-note">
				Choose a display for drawing or iPad annotations. Window scenes can switch during
				native macOS window recording. Microphone and system audio use the recorder’s
				current settings.
			</div>
			{draft && (
				<form
					className="recording-scene-form"
					onSubmit={(e) => {
						e.preventDefault();
						if (saving) return;
						setSaving(true);
						setError("");
						void saveShortcut("saveScene", draft)
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
					<div>
						<button
							type="submit"
							title="Save this scene. You can assign its shortcut in the scene list."
							disabled={!draft.source || !draft.name.trim() || busy || saving}
						>
							{saving ? "Saving…" : "Save scene"}
						</button>{" "}
						<button type="button" title="Discard these scene edits." disabled={saving} onClick={() => setDraft(undefined)}>
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
					<h3>No scenes needed to start</h3>
					<p>Record directly from the toolbar, or save a setup you use often.</p>
				</div>
			)}
			{scenes.map((scene) => (
				<div className="recording-scene-row" key={scene.id}>
					<div className="scene-description">
						<strong>{scene.name}</strong>
						<small>
							{scene.source.name} · Camera {scene.camera ? "on" : "off"}
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
						title="Select this source and turn the face camera on or off as saved."
						onClick={() => void run("applyScene", scene.id)}
					>
						Use
					</button>
					<button disabled={busy || info.recording} title="Change this scene’s name, source, or face camera state." onClick={() => setDraft(scene)}>
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
		</>
	);
}
