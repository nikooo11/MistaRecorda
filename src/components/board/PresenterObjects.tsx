import { useState } from "react";
import {
	BrowserIcon,
	ImageIcon,
	FilmStripIcon,
	SpeakerHighIcon,
	GearSixIcon,
	NoteIcon,
} from "@phosphor-icons/react";
import type { BoardAPI } from "../../types/board";
import {
	objectKey,
	type PresenterDocument,
	type PresenterLink,
	type PresenterObject,
} from "../../types/presenter";
import type { SoundEffect } from "../../types/studio";
import { SHADOW_HELP } from "./shadowObjects";
import type { MemeTransition } from "../../types/memes";
import { presenterURL, presenterId } from "./presenterModel";

export function ObjectIcon({ kind }: { kind: PresenterObject["kind"] }) {
	const Icon = {
		link: BrowserIcon,
		image: ImageIcon,
		meme: FilmStripIcon,
		sound: SpeakerHighIcon,
		note: NoteIcon,
	}[kind];
	return <Icon size={18} aria-hidden="true" />;
}
export function ObjectPreview({ object }: { object: PresenterObject }) {
	return (
		<span className={`presenter-preview type-${object.kind}`}>
			{object.preview ? (
				<img src={object.preview} alt="" />
			) : (
				<ObjectIcon kind={object.kind} />
			)}
			<span className="presenter-type">
				<ObjectIcon kind={object.kind} />
			</span>
			{object.containsAudio && (
				<span
					className="meme-audio-badge"
					title="Contains audio"
					aria-label="Contains audio"
				>
					<SpeakerHighIcon size={14} />
				</span>
			)}
		</span>
	);
}
export function PresenterObjects({
	objects,
	document,
	sounds,
	transport,
	onChanged,
	onChoose,
	onMemeSettings,
	onImportMeme,
	onError,
}: {
	objects: PresenterObject[];
	document: PresenterDocument;
	sounds: Omit<SoundEffect, "file">[];
	transport: BoardAPI;
	onChanged: (doc: PresenterDocument) => void;
	onChoose: (o: PresenterObject) => void;
	onMemeSettings: (id: string) => void;
	onImportMeme: () => void;
	onError: (text: string) => void;
}) {
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState("all");
	const [editing, setEditing] = useState<PresenterObject>();
	const [link, setLink] = useState<PresenterLink>();
	const [name, setName] = useState("");
	const [width, setWidth] = useState(30);
	const [sound, setSound] = useState<Omit<SoundEffect, "file">>();
	const [shadow, setShadow] = useState(false);
	const [enter, setEnter] = useState<MemeTransition>("none");
	const [noteText, setNoteText] = useState("");
	const [busy, setBusy] = useState(false);
	const run = async (action: () => Promise<unknown>) => {
		setBusy(true);
		onError("");
		try {
			await action();
		} catch (e) {
			onError(String(e));
		} finally {
			setBusy(false);
		}
	};
	function edit(o: PresenterObject) {
		if (o.kind === "meme") {
			onMemeSettings(o.id);
			return;
		}
		setEditing(o);
		setName(o.name);
		setShadow(o.shadow ?? o.kind === "note");
		setEnter(o.enter ?? "none");
		setNoteText(o.text ?? "");
		setWidth(o.widthPercent ?? 30);
		setLink(document.links.find((l) => o.kind === "link" && l.id === o.id));
		setSound(sounds.find((s) => o.kind === "sound" && s.id === o.id));
	}
	const save = () =>
		run(async () => {
			if (link)
				onChanged(await transport.request<PresenterDocument>("savePresenterLink", link));
			else if (editing?.kind === "sound" && sound)
				await transport.request("updatePresenterSound", {
					...sound,
					name,
					favorite: !!sound.favorite,
					color: sound.color || "#466784",
				});
			else if (editing?.kind === "note")
				onChanged(
					await transport.request<PresenterDocument>("saveCanvasNote", {
						id: editing.id,
						name,
						text: noteText,
					}),
				);
			const target = editing ?? (link ? { kind: "link" as const, id: link.id } : undefined);
			if (target)
				onChanged(
					await transport.request<PresenterDocument>("saveObjectPreference", {
						key: objectKey(target),
						preference: {
							...(target.kind === "image" || target.kind === "note" ? { name } : {}),
							widthPercent: width,
							shadow,
							enter,
						},
					}),
				);
			setEditing(undefined);
			setLink(undefined);
			setSound(undefined);
		});
	if (editing || link)
		return (
			<form
				className="presenter-settings"
				onSubmit={(e) => {
					e.preventDefault();
					void save();
				}}
			>
				<strong>
					{link
						? "Webpage settings"
						: `${editing?.kind === "sound" ? "Sound" : editing?.kind === "note" ? "Note" : "Image"} settings`}
				</strong>
				<label>
					Name
					<input
						aria-label="Object name"
						required
						maxLength={80}
						value={link ? link.name : name}
						onChange={(e) =>
							link
								? setLink({ ...link, name: e.target.value })
								: setName(e.target.value)
						}
					/>
				</label>
				{link ? (
					<>
						<label>
							Web address
							<input
								type="url"
								required
								aria-label="Web address"
								maxLength={4096}
								placeholder="https://…"
								value={link.url}
								onChange={(e) => setLink({ ...link, url: e.target.value })}
							/>
						</label>
						<label>
							Start at
							<select
								aria-label="Start at"
								value={link.startAt}
								onChange={(e) =>
									setLink({
										...link,
										startAt: e.target.value as PresenterLink["startAt"],
									})
								}
							>
								<option value="url">Position in saved link</option>
								<option value="text">Exact text on the page</option>
								<option value="anchor">Section ID / anchor</option>
							</select>
						</label>
						{link.startAt !== "url" && (
							<label>
								{link.startAt === "text" ? "Text to scroll to" : "Section ID"}
								<textarea
									aria-label="Scroll target"
									required
									maxLength={500}
									value={link.target}
									onChange={(e) => setLink({ ...link, target: e.target.value })}
								/>
							</label>
						)}
						<p className="presenter-help">
							Opens a new Chrome tab on the computer with your existing logins. Exact
							text scrolls to the first matching passage. If the page changed or loads
							text late, it may open at the top.
						</p>
						<p className="presenter-help">
							Webpages open in Chrome, including when dragged. Use Capture Mac screen
							to bring a still onto the whiteboard.
						</p>
					</>
				) : editing?.kind === "note" ? (
					<label>
						Note text
						<textarea
							aria-label="Canvas note text"
							required
							maxLength={10000}
							value={noteText}
							onChange={(e) => setNoteText(e.target.value)}
						/>
					</label>
				) : sound ? (
					<>
						<label>
							Volume · {Math.round(sound.volume * 100)}%
							<input
								aria-label="Sound volume"
								type="range"
								min={0}
								max={2}
								step={0.05}
								value={sound.volume}
								onChange={(e) =>
									setSound({ ...sound, volume: Number(e.target.value) })
								}
							/>
						</label>
						<label>
							Button color
							<input
								aria-label="Sound color"
								type="color"
								value={sound.color || "#466784"}
								onChange={(e) => setSound({ ...sound, color: e.target.value })}
							/>
						</label>
						<label className="presenter-check">
							<input
								type="checkbox"
								checked={!!sound.favorite}
								onChange={(e) => setSound({ ...sound, favorite: e.target.checked })}
							/>
							Favorite
						</label>
						<p className="presenter-help">
							Uses the soundboard’s current recording or streaming mode. Wear
							headphones to prevent microphone echo.
						</p>
					</>
				) : (
					<>
						<label>
							Starting width · {width}%
							<input
								aria-label="Image starting width"
								type="range"
								min={5}
								max={100}
								value={width}
								onChange={(e) => setWidth(Number(e.target.value))}
							/>
						</label>
						<p className="presenter-help">
							Tap or hold and drag to place. After placing, use Select to move or
							resize. Each placement is a separate object and remains until cleared.
						</p>
					</>
				)}
				<label className="presenter-check">
					<input
						type="checkbox"
						checked={shadow}
						onChange={(e) => setShadow(e.target.checked)}
					/>
					Shadow object · iPad only
				</label>
				<p className="presenter-help">
					{SHADOW_HELP}
					{(link || sound) &&
						" A private cue card lets you open the link or play the sound when ready."}
				</p>
				{!link && !sound && (
					<label>
						Transition in
						<select
							value={enter}
							onChange={(e) => setEnter(e.target.value as MemeTransition)}
						>
							{["none", "fade", "spin", "fall"].map((t) => (
								<option key={t}>{t}</option>
							))}
						</select>
					</label>
				)}
				<footer>
					<button disabled={busy} type="submit">
						Save object
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={() => {
							setEditing(undefined);
							setLink(undefined);
							setSound(undefined);
						}}
					>
						Cancel
					</button>
				</footer>
				{link && document.links.some((l) => l.id === link.id) && (
					<button
						type="button"
						disabled={busy}
						onClick={() =>
							void run(async () => {
								onChanged(
									await transport.request<PresenterDocument>(
										"removePresenterLink",
										link.id,
									),
								);
								setEditing(undefined);
								setLink(undefined);
							})
						}
					>
						Remove link
					</button>
				)}
			</form>
		);
	return (
		<>
			<div className="presenter-create">
				<button
					onClick={() => {
						setShadow(false);
						setEnter("none");
						setLink({
							id: presenterId(),
							name: "",
							url: "",
							startAt: "url",
							target: "",
						});
					}}
				>
					＋ Link
				</button>
				<label className="presenter-upload">
					＋ Image
					<input
						type="file"
						accept="image/png,image/jpeg,image/webp"
						disabled={busy}
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							if (!file) return;
							void run(async () => {
								if (file.size > 12 * 1024 * 1024)
									throw Error("Choose an image under 12 MB.");
								const dataURL = await new Promise<string>((resolve, reject) => {
									const reader = new FileReader();
									reader.onload = () => resolve(String(reader.result));
									reader.onerror = () => reject(Error("Could not read image"));
									reader.readAsDataURL(file);
								});
								await transport.request("importPresenterImage", {
									dataURL,
									name: file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Image",
								});
							});
						}}
					/>
				</label>
				<button onClick={onImportMeme}>＋ Meme</button>
				<button
					onClick={() =>
						edit({
							kind: "note",
							id: presenterId(),
							name: "New note",
							detail: "Private note",
							shadow: true,
							text: "",
						})
					}
				>
					＋ Note
				</button>
			</div>
			<div className="presenter-filter">
				<input
					type="search"
					aria-label="Find object"
					placeholder="Find an object…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<select
					aria-label="Object type"
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
				>
					{["all", "image", "meme", "sound", "link", "note"].map((kind) => (
						<option key={kind} value={kind}>
							{kind === "all" ? "All types" : kind[0].toUpperCase() + kind.slice(1)}
						</option>
					))}
				</select>
			</div>
			<div className="presenter-object-list">
				{objects
					.filter(
						(o) =>
							(filter === "all" || filter === o.kind) &&
							[o.name, ...(o.searchTerms ?? [])]
								.join(" ")
								.toLowerCase()
								.includes(search.toLowerCase()),
					)
					.map((o) => (
						<div className={`presenter-object type-${o.kind}`} key={objectKey(o)}>
							<button className="presenter-object-use" onClick={() => onChoose(o)}>
								<ObjectPreview object={o} />
								<span>
									<strong>{o.name}</strong>
									<small>
										{o.shadow ? "Shadow · " : ""}
										{o.detail}
									</small>
								</span>
							</button>
							<button aria-label={`Settings for ${o.name}`} onClick={() => edit(o)}>
								<GearSixIcon size={18} />
							</button>
						</div>
					))}
			</div>
			{!objects.length && (
				<p>
					Add a link, image or meme to get started. Sounds imported on the Mac appear here
					too.
				</p>
			)}
			<p className="presenter-help">
				Sound files are imported in Mac Capture settings → Sound effects. Their names,
				colors and favorites stay shared with this iPad.
			</p>
		</>
	);
}
export function validNoteLink(value: string) {
	try {
		return presenterURL(value).href;
	} catch {
		return null;
	}
}
