import { useState } from "react";
import {
	ImageIcon,
	FilmStripIcon,
	MusicNoteIcon,
	EyeIcon,
	EyeSlashIcon,
	ArrowUpIcon,
	ArrowDownIcon,
	TrashIcon,
	MonitorIcon,
	CameraIcon,
	GearSixIcon,
} from "@phosphor-icons/react";
import type { SceneMediaSource, StudioInfo } from "../../types/studio";

export function SceneSourceDock({
	info,
	media,
	change,
	selected,
	select,
	busy,
	error,
}: {
	info: StudioInfo;
	media: SceneMediaSource[];
	change: (media: SceneMediaSource[]) => Promise<void>;
	selected?: string;
	select: (id?: string) => void;
	busy: boolean;
	error: string;
}) {
	const [importing, setImporting] = useState(false);
	const [failure, setFailure] = useState("");
	const [properties, setProperties] = useState(false);
	const [dragged, setDragged] = useState<string>();
	const locked = busy || importing || info.recording || !info.selectedSource;
	const item = media.find((s) => s.id === selected);
	const patch = (value: Partial<SceneMediaSource>) => {
		if (item) void change(media.map((s) => (s.id === item.id ? { ...s, ...value } : s)));
	};
	const move = (from: number, to: number) => {
		if (from < 0 || to < 0 || to >= media.length || from === to) return;
		const next = [...media];
		next.splice(to, 0, next.splice(from, 1)[0]);
		void change(next);
	};
	const add = async (kind: SceneMediaSource["kind"]) => {
		setImporting(true);
		setFailure("");
		try {
			const source = await window.electronAPI.studio.request<SceneMediaSource | null>(
				"importSceneMedia",
				kind,
			);
			if (source) {
				await change([source, ...media]);
				select(source.id);
			}
		} catch (e) {
			setFailure(e instanceof Error ? e.message : String(e));
		} finally {
			setImporting(false);
		}
	};
	return (
		<section className="scene-source-dock" aria-label="Sources and layers">
			<header>
				<h2>Sources</h2>
				<span>
					{info.settings.scenes.find((s) => s.id === info.activeSceneId)?.name ??
						"Current setup"}
				</span>
			</header>
			<div className="source-add-buttons">
				<button
					disabled={locked || media.length >= 24}
					onClick={() => void add("image")}
					data-help="Add a PNG, image or GIF overlay. It is saved in this scene. Select it below, then drag or resize it in the preview."
				>
					<ImageIcon size={16} /> Add image
				</button>
				<details>
					<summary aria-label="Add other source">＋</summary>
					<div>
						<button
							disabled={locked || media.length >= 24}
							onClick={() => void add("video")}
						>
							<FilmStripIcon /> Video
						</button>
						<button
							disabled={locked || media.length >= 24}
							onClick={() => void add("audio")}
						>
							<MusicNoteIcon /> Audio / music
						</button>
					</div>
				</details>
			</div>
			<p className="capture-note">Top layer appears in front. Drag rows to reorder.</p>
			<div className="source-layer-fixed">
				<CameraIcon size={15} />
				<span>Facecam</span>
				<small>{info.camera?.enabled ? "On · above overlays" : "Off"}</small>
			</div>
			<div className="source-layer-list" role="list" aria-label="Overlay layers">
				{media.map((source, i) => {
					const Icon =
						source.kind === "image"
							? ImageIcon
							: source.kind === "video"
								? FilmStripIcon
								: MusicNoteIcon;
					return (
						<div
							role="listitem"
							className="source-layer-row"
							data-selected={selected === source.id}
							key={source.id}
							draggable={!locked}
							onDragStart={(e) => {
								setDragged(source.id);
								e.dataTransfer.setData("text/plain", source.id);
							}}
							onDragOver={(e) => {
								if (dragged && !locked) e.preventDefault();
							}}
							onDrop={(e) => {
								e.preventDefault();
								if (!locked)
									move(
										media.findIndex((s) => s.id === dragged),
										i,
									);
								setDragged(undefined);
							}}
							onDragEnd={() => setDragged(undefined)}
						>
							<button
								className="source-layer-name"
								aria-pressed={selected === source.id}
								onClick={() => select(source.id)}
								title={`Select ${source.name}`}
							>
								<Icon size={16} />
								<span>{source.name}</span>
							</button>
							<button
								disabled={locked}
								aria-label={`${source.enabled ? "Hide" : "Show"} ${source.name}`}
								onClick={() =>
									void change(
										media.map((s) =>
											s.id === source.id ? { ...s, enabled: !s.enabled } : s,
										),
									)
								}
							>
								{source.enabled ? <EyeIcon /> : <EyeSlashIcon />}
							</button>
						</div>
					);
				})}
			</div>
			<div className="source-layer-fixed">
				<MonitorIcon size={15} />
				<span title={info.selectedName}>{info.selectedName}</span>
				<small>Base</small>
			</div>
			{!media.length && (
				<p className="capture-note">
					Add a logo, reference image or video above your screen. Your setup saves
					automatically as a scene.
				</p>
			)}
			{item && (
				<>
					<div className="source-layer-actions">
						<button
							disabled={locked || media[0]?.id === item.id}
							aria-label={`Move ${item.name} up`}
							onClick={() => move(media.indexOf(item), media.indexOf(item) - 1)}
						>
							<ArrowUpIcon />
						</button>
						<button
							disabled={locked || media[media.length - 1]?.id === item.id}
							aria-label={`Move ${item.name} down`}
							onClick={() => move(media.indexOf(item), media.indexOf(item) + 1)}
						>
							<ArrowDownIcon />
						</button>
						<button
							aria-expanded={properties}
							onClick={() => setProperties(!properties)}
						>
							<GearSixIcon /> Properties
						</button>
						<button
							disabled={locked}
							aria-label={`Remove ${item.name}`}
							onClick={() => {
								void change(media.filter((s) => s.id !== item.id));
								select(undefined);
							}}
						>
							<TrashIcon />
						</button>
					</div>
					{properties && (
						<fieldset disabled={locked} className="source-layer-properties">
							<label>
								Name
								<input
									key={item.id}
									defaultValue={item.name}
									maxLength={100}
									onBlur={(e) => {
										const name = e.target.value.trim();
										if (name && name !== item.name) patch({ name });
									}}
								/>
							</label>
							{(item.kind !== "audio"
								? (["x", "y", "width", "height", "opacity"] as const)
								: []
							).map((key) => (
								<label key={key}>
									{
										{
											x: "Left",
											y: "Top",
											width: "Width",
											height: "Height",
											opacity: "Opacity",
										}[key]
									}
									<input
										type="number"
										min={key === "width" || key === "height" ? 5 : 0}
										max={100}
										key={`${item.id}-${key}-${item[key]}`}
										defaultValue={Math.round(item[key] * 100)}
										onBlur={(e) => {
											const v = Number(e.target.value);
											if (
												v >=
													(key === "width" || key === "height" ? 5 : 0) &&
												v <= 100
											)
												patch({ [key]: v / 100 });
											else
												e.target.value = String(
													Math.round(item[key] * 100),
												);
										}}
									/>
									%
								</label>
							))}
							{item.hasAudio && (
								<label>
									Volume
									<input
										type="range"
										min={0}
										max={100}
										value={item.volume * 100}
										onChange={(e) =>
											patch({ volume: Number(e.target.value) / 100 })
										}
									/>
								</label>
							)}
							{item.kind !== "image" && (
								<label>
									<input
										type="checkbox"
										checked={item.loop}
										onChange={(e) => patch({ loop: e.target.checked })}
									/>
									Loop
								</label>
							)}
						</fieldset>
					)}
				</>
			)}
			{importing && <p role="status">Importing source…</p>}
			{info.recording && (
				<p className="capture-note">
					Stop recording to edit layers. Scene switching stays available.
				</p>
			)}
			{(error || failure) && (
				<p role="alert" className="capture-error">
					{error || failure}
				</p>
			)}
		</section>
	);
}
