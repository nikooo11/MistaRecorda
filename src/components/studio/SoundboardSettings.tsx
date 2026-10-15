import { HelpTarget, SettingHelp, useSettingsTourTarget } from "../settings-guide/SettingHelp";
import { useEffect, useState } from "react";
import type { SoundEffect, StudioInfo } from "../../types/studio";
import { ShortcutInput } from "./ShortcutInput";
import { StreamSettings } from "./StreamSettings";
import { VoiceCuePicker } from "./VoiceCuePicker";

export const soundRecordingHelp =
	"On: sounds play on your Mac and are included in the recorded audio. Off: sounds still play for monitoring, but are saved as separate clips you can move or remove in the editor. Use headphones in either mode so your microphone does not record the speaker playback a second time.";
export function SoundRecordingOption({
	info,
	disabled,
	run,
}: {
	info: StudioInfo;
	disabled: boolean;
	run: (method: string, input?: unknown) => Promise<void>;
}) {
	const included = info.settings.includeSoundboardInRecording !== false;
	return (
		<HelpTarget id="soundRecording">
			<div className="sound-recording-option">
				<label data-help={soundRecordingHelp}>
					<input
						type="checkbox"
						checked={included}
						disabled={disabled || info.recording}
						onChange={(e) => void run("includeSoundboardInRecording", e.target.checked)}
					/>
					Include soundboard in recording
				</label>
				<SettingHelp id="soundRecording" />
				<small>
					{included
						? "Sounds become part of the recorded audio."
						: "Sounds become movable clips in the editor."}
				</small>
				{!included && (
					<p className="sound-caution">
						⚠ Use headphones. Sounds still play for you; speakers can leak into the
						microphone and duplicate the editable sound clips.
					</p>
				)}
			</div>
		</HelpTarget>
	);
}

function SoundRow({
	sound,
	info,
	busy,
	run,
}: {
	sound: SoundEffect;
	info: StudioInfo;
	busy: boolean;
	run: (method: string, input?: unknown) => Promise<void>;
}) {
	const [name, setName] = useState(sound.name);
	const update = (patch: Partial<SoundEffect>) => run("updateSound", { ...sound, ...patch });
	return (
		<div className="sound-row" style={{ borderLeftColor: sound.color || "#466784" }}>
			<button
				className="sound-fire"
				disabled={busy}
				onClick={() => void run("fireSound", sound.id)}
				aria-label={`Play ${sound.name}`}
				title="Play on the Mac. While recording, use the selected recording option above."
			>
				▶
			</button>
			<div className="sound-details">
				<input
					aria-label={`Rename ${sound.name}`}
					value={name}
					maxLength={100}
					disabled={info.recording || busy}
					onChange={(e) => setName(e.target.value)}
					onBlur={() => {
						if (name.trim() && name.trim() !== sound.name)
							void update({ name: name.trim() });
						else setName(sound.name);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") e.currentTarget.blur();
					}}
				/>
				<small>{(sound.durationMs / 1000).toFixed(1)} seconds</small>
			</div>
			<button
				aria-label={`${sound.favorite ? "Unfavorite" : "Favorite"} ${sound.name}`}
				aria-pressed={!!sound.favorite}
				disabled={busy || info.recording}
				onClick={() => void update({ favorite: !sound.favorite })}
			>
				{sound.favorite ? "★" : "☆"}
			</button>
			<input
				type="color"
				aria-label={`${sound.name} button color`}
				value={sound.color || "#466784"}
				disabled={busy || info.recording}
				onChange={(e) => void update({ color: e.target.value })}
			/>
			<ShortcutInput
				value={sound.shortcut}
				disabled={busy || info.recording}
				label={`${sound.name} shortcut`}
				assigned={[
					{ shortcut: info.settings.cameraShortcut, name: "Face camera" },
					...info.settings.scenes.map((s) => ({ shortcut: s.shortcut, name: s.name })),
					...info.settings.windows.map((w) => ({
						shortcut: w.shortcut,
						name: w.source.name,
					})),
					...info.settings.sounds
						.filter((s) => s.id !== sound.id)
						.map((s) => ({ shortcut: s.shortcut, name: s.name })),
				]}
				onChange={(shortcut) => update({ shortcut })}
			/>
			<label className="sound-level">
				Volume{" "}
				<input
					type="number"
					min={0}
					max={200}
					step={5}
					aria-label={`${sound.name} volume percent`}
					defaultValue={Math.round(sound.volume * 100)}
					disabled={info.recording || busy}
					onBlur={(e) => {
						const v = Number(e.target.value);
						if (Number.isFinite(v) && v >= 0 && v <= 200)
							void update({ volume: v / 100 });
					}}
				/>
			</label>
			<button
				aria-label={`Remove ${sound.name}`}
				disabled={busy || info.recording}
				onClick={() => void run("removeSound", sound.id)}
			>
				×
			</button>
		</div>
	);
}

export function SoundboardSettings({
	info,
	busy,
	run,
}: {
	info: StudioInfo;
	busy: boolean;
	run: (method: string, input?: unknown) => Promise<void>;
}) {
	const tourTarget = useSettingsTourTarget();
	useEffect(() => {
		if (tourTarget?.startsWith("stream")) setTab("stream");
	}, [tourTarget]);
	const [search, setSearch] = useState("");
	const [tab, setTab] = useState<"sounds" | "voices" | "stream">("sounds");
	const sounds = [...info.settings.sounds]
		.sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite))
		.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
	return (
		<>
			<div className="capture-section-heading">
				<div>
					<h2>Soundboard</h2>
					<p>Play on the Mac or iPad. Names, colors and favorites stay in sync.</p>
				</div>
				<button disabled={busy || info.recording} onClick={() => void run("importSound")}>
					＋ Import sound
				</button>
			</div>
			<nav className="sound-tabs">
				<button aria-pressed={tab === "sounds"} onClick={() => setTab("sounds")}>
					Sounds
				</button>
				<button aria-pressed={tab === "voices"} onClick={() => setTab("voices")}>
					Voices
				</button>
				<button aria-pressed={tab === "stream"} onClick={() => setTab("stream")}>
					Stream
				</button>
			</nav>
			{tab === "stream" ? (
				<StreamSettings request={window.electronAPI.studio.request} />
			) : tab === "voices" ? (
				<VoiceCuePicker request={window.electronAPI.studio.request} />
			) : (
				<>
					<SoundRecordingOption info={info} disabled={busy} run={run} />
					<input
						className="sound-search"
						type="search"
						placeholder="Find a sound…"
						aria-label="Find a sound"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
					<div className="sound-list">
						{sounds.map((sound) => (
							<SoundRow
								key={sound.id}
								sound={sound}
								info={info}
								busy={busy}
								run={run}
							/>
						))}
						{!sounds.length && (
							<p>
								{info.settings.sounds.length
									? "No matching sounds."
									: "Import a sound to get started."}
							</p>
						)}
					</div>
					<button
						disabled={busy || info.recording}
						onClick={() => void run("restoreDefaultSounds")}
						title="Bring back removed starter sounds. Keeps your sounds, names, colors, favorites and shortcuts."
					>
						Restore default sounds
					</button>
				</>
			)}
		</>
	);
}
