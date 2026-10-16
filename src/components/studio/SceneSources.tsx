import { useState } from "react";
import {
	CameraIcon,
	MonitorIcon,
	MicrophoneIcon,
	SpeakerHighIcon,
	ImageIcon,
	FilmStripIcon,
	MusicNoteIcon,
	EyeIcon,
	EyeSlashIcon,
	ArrowUpIcon,
	ArrowDownIcon,
	TrashIcon,
	GearSixIcon,
} from "@phosphor-icons/react";
import type { RecordingScene, SceneMediaSource, StudioSource } from "../../types/studio";

export function SceneSources({
	scene,
	sources,
	change,
	onBusy,
}: {
	scene: RecordingScene;
	sources: StudioSource[];
	change: (value: RecordingScene) => void;
	onBusy: (busy: boolean) => void;
}) {
	const [adding, setAdding] = useState(false);
	const [error, setError] = useState("");
	const [expanded, setExpanded] = useState<string>();
	const media = scene.media ?? [];
	const patch = (id: string, value: Partial<SceneMediaSource>) =>
		change({ ...scene, media: media.map((s) => (s.id === id ? { ...s, ...value } : s)) });
	const move = (index: number, offset: number) => {
		const next = [...media];
		[next[index], next[index + offset]] = [next[index + offset], next[index]];
		change({ ...scene, media: next });
	};
	const add = async (kind: string) => {
		setError("");
		if (kind === "camera") {
			change({ ...scene, camera: true });
			return;
		}
		if (kind === "microphone" || kind === "system") {
			change({
				...scene,
				audio: { microphone: true, system: true, ...scene.audio, [kind]: true },
			});
			return;
		}
		if (!["image", "video", "audio"].includes(kind)) return;
		setAdding(true);
		onBusy(true);
		try {
			const item = await window.electronAPI.studio.request<SceneMediaSource | null>(
				"importSceneMedia",
				kind,
			);
			if (item) change({ ...scene, media: [item, ...media] });
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setAdding(false);
			onBusy(false);
		}
	};
	return (
		<section className="scene-source-editor" aria-label="Scene sources">
			<div className="scene-source-heading">
				<strong>Sources</strong>
				<select
					aria-label="Add source"
					data-help="Add an image, GIF, video or audio file to this scene, or enable its camera and audio inputs. Imported files are copied into app storage."
					value=""
					disabled={adding || media.length >= 24}
					onChange={(e) => void add(e.target.value)}
				>
					<option value="">+ Add source…</option>
					<option value="image">Image / GIF</option>
					<option value="video">Video file</option>
					<option value="audio">Audio / music file</option>
					<option value="camera">Face camera</option>
					<option value="microphone">Microphone</option>
					<option value="system">Computer audio</option>
				</select>
			</div>
			<p className="capture-note">
				Choose your screen below. Add media above it; the first item is on top. Facecam and
				drawings stay above scene media.
			</p>
			{adding && <p role="status">Preparing media… Large videos can take a moment.</p>}
			{error && (
				<p role="alert" className="capture-error">
					{error}
				</p>
			)}
			{media.map((s, i) => {
				const Icon =
					s.kind === "image"
						? ImageIcon
						: s.kind === "video"
							? FilmStripIcon
							: MusicNoteIcon;
				return (
					<div key={s.id} className="scene-media-item">
						<div className="scene-source-row">
							<Icon size={18} />
							<span title={s.name}>
								{s.name}
								<small>
									{s.kind === "audio"
										? "Audio file"
										: s.kind === "video"
											? "Video"
											: "Image"}
								</small>
							</span>
							<button
								type="button"
								aria-label={`${s.enabled ? "Hide" : "Show"} ${s.name}`}
								onClick={() => patch(s.id, { enabled: !s.enabled })}
							>
								{s.enabled ? <EyeIcon /> : <EyeSlashIcon />}
							</button>
							<button
								type="button"
								aria-label={`Settings for ${s.name}`}
								aria-expanded={expanded === s.id}
								onClick={() => setExpanded(expanded === s.id ? undefined : s.id)}
							>
								<GearSixIcon />
							</button>
						</div>
						{expanded === s.id && (
							<div className="scene-media-fields">
								<label>
									Name
									<input
										value={s.name}
										maxLength={100}
										onChange={(e) => patch(s.id, { name: e.target.value })}
									/>
								</label>
								{s.kind !== "audio" && (
									<>
										{(["x", "y", "width", "height", "opacity"] as const).map(
											(key) => (
												<label key={key}>
													{
														{
															x: "Left",
															y: "Top",
															width: "Width",
															height: "Height",
															opacity: "Opacity",
														}[key]
													}{" "}
													<output>{Math.round(s[key] * 100)}%</output>
													<input
														aria-label={`${s.name} ${key}`}
														data-help={
															key === "opacity"
																? "Lower opacity to make this image or video more transparent over the screen."
																: key === "width" ||
																		key === "height"
																	? "Resize the area for this source. The image or video keeps its proportions inside it."
																	: "Move this source within the recorded scene. Values are percentages of the canvas."
														}
														type="range"
														min={
															key === "width" || key === "height"
																? 5
																: 0
														}
														max={100}
														value={Math.round(s[key] * 100)}
														onChange={(e) =>
															patch(s.id, {
																[key]: Number(e.target.value) / 100,
															})
														}
													/>
												</label>
											),
										)}
										<small>Media keeps its proportions inside this area.</small>
									</>
								)}
								{s.hasAudio && (
									<label>
										Volume <output>{Math.round(s.volume * 100)}%</output>
										<input
											aria-label={`${s.name} volume`}
											type="range"
											min={0}
											max={100}
											value={s.volume * 100}
											onChange={(e) =>
												patch(s.id, {
													volume: Number(e.target.value) / 100,
												})
											}
										/>
									</label>
								)}
								{s.kind !== "image" && (
									<label>
										<input
											data-help="Restart this clip when it ends, for as long as its scene is active. Use this for background music or looping video."
											type="checkbox"
											checked={s.loop}
											onChange={(e) =>
												patch(s.id, { loop: e.target.checked })
											}
										/>{" "}
										Loop while this scene is active
									</label>
								)}
								<div className="scene-media-actions">
									<button
										type="button"
										disabled={i === 0}
										aria-label={`Move ${s.name} up`}
										onClick={() => move(i, -1)}
									>
										<ArrowUpIcon /> Up
									</button>
									<button
										type="button"
										disabled={i === media.length - 1}
										aria-label={`Move ${s.name} down`}
										onClick={() => move(i, 1)}
									>
										<ArrowDownIcon /> Down
									</button>
									<button
										type="button"
										aria-label={`Remove ${s.name}`}
										onClick={() =>
											change({
												...scene,
												media: media.filter((item) => item.id !== s.id),
											})
										}
									>
										<TrashIcon /> Remove
									</button>
								</div>
							</div>
						)}
					</div>
				);
			})}
			<label className="scene-screen-source">
				<span>
					<MonitorIcon size={18} /> Screen / window
				</span>
				<select
					aria-label="Scene screen or window"
					data-help="Choose the screen or application window behind this scene’s media. Start a window recording to switch between saved windows during a take."
					required
					value={scene.source?.id ?? ""}
					onChange={(e) => {
						const source = sources.find((s) => s.id === e.target.value);
						if (source) change({ ...scene, source });
					}}
				>
					<option value="">Choose a screen or window…</option>
					{scene.source && !sources.some((s) => s.id === scene.source.id) && (
						<option value={scene.source.id}>{scene.source.name} (unavailable)</option>
					)}
					{sources.map((s) => (
						<option key={s.id} value={s.id}>
							{s.name}
						</option>
					))}
				</select>
			</label>
			{(
				[
					{ key: "camera", label: "Face camera", Icon: CameraIcon },
					{ key: "microphone", label: "Microphone", Icon: MicrophoneIcon },
					{ key: "system", label: "Computer audio", Icon: SpeakerHighIcon },
				] as const
			).map(({ key, label, Icon }) => (
				<label className="scene-source-row" key={key}>
					<Icon size={18} />
					<span>{label}</span>
					<input
						aria-label={label}
						data-help={
							key === "camera"
								? "Show your facecam when this scene is recalled. Set its frame and position below."
								: key === "microphone"
									? "Record your voice in this scene. Turn off for a silent segment; start the take with your mic on to restore it later."
									: "Include computer sounds such as videos or games in this scene. This is separate from microphone narration."
						}
						type="checkbox"
						checked={key === "camera" ? scene.camera : (scene.audio?.[key] ?? true)}
						onChange={(e) =>
							change(
								key === "camera"
									? { ...scene, camera: e.target.checked }
									: {
											...scene,
											audio: {
												microphone: true,
												system: true,
												...scene.audio,
												[key]: e.target.checked,
											},
										},
							)
						}
					/>
				</label>
			))}
			<p className="capture-note">
				Videos and audio start when recording starts or this scene is recalled. Pausing
				pauses playback. Use headphones when monitoring media with your microphone on.
			</p>
		</section>
	);
}
