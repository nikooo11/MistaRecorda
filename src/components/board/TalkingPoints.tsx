import {
	lazy,
	Suspense,
	useEffect,
	useMemo,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from "react";
import { ListBulletsIcon, XIcon } from "@phosphor-icons/react";
import type { BoardAPI, BoardState } from "../../types/board";
import {
	emptyPresenterDocument,
	objectKey,
	type PresenterDocument,
	type PresenterObject,
	type TalkingNotes,
} from "../../types/presenter";
import type { SoundEffect } from "../../types/studio";
import { mentionAt, noteParts, presenterObjects, referenceToken } from "./presenterModel";
import { ObjectIcon, PresenterObjects, validNoteLink } from "./PresenterObjects";
import "./presenter.css";
import { talkingPointRows, editTalkingPoint, referenceTap } from "./talkingPointRows";
import type { ChartDocument } from "../../types/charts";
import { EnvironmentFiles } from "./EnvironmentFiles";
const PrivatePDFPanel = lazy(() =>
	import("./PrivatePDFPanel").then((m) => ({ default: m.PrivatePDFPanel })),
);
export interface PlacementPoint {
	x: number;
	y: number;
}
export function TalkingPoints({
	transport,
	state,
	onPlace,
	onPreview,
	onMemeSettings,
	charts = [],
	onChartSettings,
	dock = false,
	openRequest = 0,
}: {
	charts?: ChartDocument[];
	onChartSettings?: (id: string) => void;
	dock?: boolean;
	openRequest?: number;
	transport: BoardAPI;
	state: BoardState;
	onPlace: (object: PresenterObject, point?: PlacementPoint, deploy?: boolean) => Promise<void>;
	onPreview: (object: PresenterObject | undefined, point?: PlacementPoint) => void;
	onMemeSettings: (id?: string) => void;
}) {
	const [open, setOpen] = useState(false);
	useEffect(() => {
		if (openRequest > 0) setOpen(true);
	}, [openRequest]);
	const [tab, setTab] = useState<"notes" | "objects" | "environments" | "pdf">("notes");
	const [doc, setDoc] = useState(emptyPresenterDocument);
	const [loaded, setLoaded] = useState(false);
	const [setName, setSetName] = useState("");
	const [armed, setArmed] = useState<PresenterObject & { url?: string }>();
	const [groupProject, setGroupProject] = useState("");
	const [groupScene, setGroupScene] = useState("");
	const [pdfVisited, setPDFVisited] = useState(false);
	const [notes, setNotes] = useState<TalkingNotes>({ body: "", references: {} });
	const [version, setVersion] = useState(0);
	const [editing, setEditing] = useState(false);
	const [busy, setBusy] = useState(false);
	const [dirty, setDirty] = useState(false);
	const [notice, setNotice] = useState("");
	const noticeTimer = useRef<ReturnType<typeof setTimeout>>();
	useEffect(() => {
		setNotice("");
		return () => clearTimeout(noticeTimer.current);
	}, [tab]);
	const [sounds, setSounds] = useState<Omit<SoundEffect, "file">[]>([]);
	const [caret, setCaret] = useState(0);
	const [addingLink, setAddingLink] = useState(false);
	const [linkURL, setLinkURL] = useState("");
	const [linkLabel, setLinkLabel] = useState("");
	const textarea = useRef<HTMLTextAreaElement>(null);
	const dirtyRef = useRef(false);
	dirtyRef.current = dirty;
	const objects = useMemo(
		() => presenterObjects(state, doc, sounds, charts),
		[state, doc, sounds, charts],
	);
	const mention = editing ? mentionAt(notes.body, caret) : null;
	useEffect(() => {
		const accept = (data: PresenterDocument) => {
			setDoc(data);
			setLoaded(true);
			if (!dirtyRef.current) {
				setNotes(data.notes);
				setVersion(data.notesVersion);
			}
		};
		const refresh = () =>
			void transport
				.request<PresenterDocument>("presenterInfo")
				.then(accept)
				.catch((e) => setNotice(String(e)));
		refresh();
		const changed = transport.on<PresenterDocument>("presenterChanged", accept);
		const connected = transport.on("connected", refresh);
		return () => {
			changed();
			connected();
		};
	}, [transport]);
	useEffect(() => {
		if (!open) return;
		const refresh = () =>
			void transport
				.request<{ sounds: Omit<SoundEffect, "file">[] }>("soundboard")
				.then((r) => setSounds(r.sounds))
				.catch((e) => setNotice(String(e)));
		refresh();
		const timer = setInterval(refresh, 3000);
		return () => clearInterval(timer);
	}, [transport, open]);
	const changed = (value: TalkingNotes) => {
		if (busy) return;
		setNotes(value);
		setDirty(true);
		dirtyRef.current = true;
	};
	function insert(
		text: string,
		start = textarea.current?.selectionStart ?? caret,
		end = textarea.current?.selectionEnd ?? caret,
	) {
		changed({ ...notes, body: notes.body.slice(0, start) + text + notes.body.slice(end) });
		setCaret(start + text.length);
		requestAnimationFrame(() => {
			textarea.current?.focus();
			textarea.current?.setSelectionRange(start + text.length, start + text.length);
		});
	}
	function insertReference(object: PresenterObject) {
		const token = referenceToken(notes, object);
		const start = mention?.start ?? caret;
		const text = `@{${token}} `;
		changed({
			...notes,
			body: notes.body.slice(0, start) + text + notes.body.slice(caret),
			references: { ...notes.references, [token]: { kind: object.kind, id: object.id } },
		});
		setTab("notes");
		setCaret(start + text.length);
		requestAnimationFrame(() => {
			textarea.current?.focus();
			textarea.current?.setSelectionRange(start + text.length, start + text.length);
		});
	}
	async function save(value = notes, stayReading = false) {
		setBusy(true);
		setNotice("");
		try {
			const next = await transport.request<PresenterDocument>("saveTalkingNotes", {
				notes: value,
				version,
			});
			setDoc(next);
			setVersion(next.notesVersion);
			setNotes(next.notes);
			setDirty(false);
			dirtyRef.current = false;
			if (!stayReading) setEditing(false);
			setNotice("Saved on your Mac and synced to connected iPads.");
		} catch (e) {
			setNotice(String(e));
		} finally {
			setBusy(false);
		}
	}
	async function manageSet(action: string, extra: Record<string, unknown> = {}) {
		if (dirty) {
			setNotice("Save your edits before switching or changing note sets.");
			return;
		}
		setBusy(true);
		try {
			const next = await transport.request<PresenterDocument>("manageTalkingSets", {
				action,
				version: doc.notesVersion,
				...extra,
			});
			setDoc(next);
			setNotes(next.notes);
			setVersion(next.notesVersion);
			setSetName("");
			setNotice("");
		} catch (e) {
			setNotice(String(e));
		} finally {
			setBusy(false);
		}
	}
	async function activateObject(
		object: PresenterObject & { url?: string },
		point?: PlacementPoint,
	) {
		if (busy) return;
		if (!point && referenceTap(armed && objectKey(armed), objectKey(object)) === "stage") {
			setArmed(object);
			setNotice("Private preview. Tap the same reference again to deploy, or Cancel.");
			return;
		}
		if (busy) return;
		setBusy(true);
		try {
			setNotice("");
			if (object.kind === "link" && !point) {
				await transport.request(
					"openPresenterLink",
					object.url ? { url: object.url } : { id: object.id },
				);
				setNotice("Opened in Chrome on the computer.");
			} else if (object.kind === "sound" && !point) {
				await transport.request("playSound", object.id);
				setNotice(`Playing ${object.name} on the computer.`);
				clearTimeout(noticeTimer.current);
				const playing = `Playing ${object.name} on the computer.`;
				noticeTimer.current = setTimeout(
					() => setNotice((current) => (current === playing ? "" : current)),
					Math.max(1800, sounds.find((s) => s.id === object.id)?.durationMs ?? 3000),
				);
			} else {
				await onPlace({ ...object, shadow: false }, point, !point);
				setOpen(false);
			}
		} catch (e) {
			setNotice(String(e));
		} finally {
			setArmed(undefined);
			setBusy(false);
		}
	}
	const openURL = (url: string) =>
		void activateObject({ kind: "link", id: url, name: "Webpage", detail: url, url });
	const activeSet = doc.noteSets?.find((s) => s.id === doc.activeSetId);
	useEffect(() => {
		setGroupProject(activeSet?.project ?? "");
		setGroupScene(activeSet?.scene ?? "");
	}, [activeSet?.project, activeSet?.scene, doc.activeSetId]);
	useEffect(() => {
		setArmed(undefined);
	}, [doc.activeSetId, open, editing]);

	return (
		<div className="presenter-ui" onKeyDown={(e) => e.stopPropagation()}>
			{!open && !dock && (
				<button
					className="talking-toggle"
					aria-expanded={false}
					onClick={() => setOpen(true)}
				>
					<ListBulletsIcon size={18} />
					<span>Points to talk about{dirty ? " •" : ""}</span>
				</button>
			)}
			{open && (
				<aside
					className="talking-panel"
					data-pdf-open={tab === "pdf"}
					aria-label="Points to talk about"
				>
					<header>
						<strong>Points to talk about</strong>
						<button aria-label="Close talking points" onClick={() => setOpen(false)}>
							<XIcon size={18} />
						</button>
					</header>
					<nav>
						<button
							aria-pressed={tab === "pdf"}
							onClick={() => {
								setPDFVisited(true);
								setTab("pdf");
							}}
						>
							PDFs
						</button>
						<button aria-pressed={tab === "notes"} onClick={() => setTab("notes")}>
							Talking points
						</button>
						<button aria-pressed={tab === "objects"} onClick={() => setTab("objects")}>
							Objects
						</button>
						<button
							aria-pressed={tab === "environments"}
							onClick={() => setTab("environments")}
						>
							Environments
						</button>
					</nav>
					<div className="talking-content">
						{pdfVisited && (
							<div hidden={tab !== "pdf"}>
								<Suspense fallback={<p>Loading PDF tools…</p>}>
									<PrivatePDFPanel
										objects={objects}
										transport={transport}
										document={doc}
										dirty={dirty}
										onChanged={(next) => {
											setDoc(next);
											if (!dirtyRef.current) {
												setNotes(next.notes);
												setVersion(next.notesVersion);
											}
										}}
										onDone={() => {
											setTab("notes");
											setNotice(
												"Presentation saved. Use Undo AI changes to restore the previous notes.",
											);
										}}
									/>
								</Suspense>
							</div>
						)}
						{!loaded ? (
							<p>Loading notes…</p>
						) : tab === "pdf" ? null : tab === "environments" ? (
							<EnvironmentFiles transport={transport} onError={setNotice} />
						) : tab === "objects" ? (
							<PresenterObjects
								objects={objects}
								document={doc}
								sounds={sounds}
								transport={transport}
								onChanged={setDoc}
								onChoose={(o) =>
									editing ? insertReference(o) : void activateObject(o)
								}
								onMemeSettings={(id) => {
									setOpen(false);
									onMemeSettings(id);
								}}
								onChartSettings={(id) => {
									setOpen(false);
									onChartSettings?.(id);
								}}
								onImportMeme={() => {
									setOpen(false);
									onMemeSettings();
								}}
								onError={setNotice}
							/>
						) : (
							<>
								<div className="talking-sets">
									<label>
										Talking-point set
										<select
											aria-label="Talking-point set"
											disabled={busy || dirty}
											value={doc.activeSetId ?? "original"}
											onChange={(e) =>
												void manageSet("select", { id: e.target.value })
											}
										>
											{(
												doc.noteSets ?? [
													{
														id: "original",
														name: "My talking points",
														notes: doc.notes,
													},
												]
											).map((s) => (
												<option key={s.id} value={s.id}>
													{[s.project, s.scene, s.name]
														.filter(Boolean)
														.join(" / ")}
												</option>
											))}
										</select>
									</label>
									<details>
										<summary>Manage sets</summary>
										<label>
											Project
											<input
												aria-label="Notes project"
												value={groupProject}
												placeholder="Project name"
												maxLength={120}
												onChange={(e) => setGroupProject(e.target.value)}
											/>
										</label>
										<label>
											Scene
											<input
												aria-label="Notes scene"
												value={groupScene}
												placeholder="Scene name"
												maxLength={120}
												onChange={(e) => setGroupScene(e.target.value)}
											/>
										</label>
										<button
											disabled={busy || dirty}
											onClick={() =>
												void manageSet("group", {
													project: groupProject,
													scene: groupScene,
												})
											}
										>
											Save grouping
										</button>
										<input
											aria-label="Note set name"
											placeholder="Name for new or renamed set"
											value={setName}
											maxLength={80}
											onChange={(e) => setSetName(e.target.value)}
										/>
										<div className="pdf-toolbar">
											<button
												data-help="Create an empty talking-point set. Your other sets stay saved."
												disabled={busy || dirty}
												onClick={() =>
													void manageSet("new", {
														name: setName || "New talking points",
													})
												}
											>
												New
											</button>
											<button
												data-help="Rename the selected set using the name above."
												disabled={busy || dirty || !setName.trim()}
												onClick={() =>
													void manageSet("rename", { name: setName })
												}
											>
												Rename
											</button>
											<button
												data-help="Copy the current points and their object references into a new set."
												disabled={busy || dirty}
												onClick={() =>
													void manageSet("duplicate", {
														name: setName || "Copy of talking points",
													})
												}
											>
												Duplicate
											</button>
											<button
												data-help="Remove the selected talking-point set after confirmation. Other sets stay saved."
												disabled={
													busy || dirty || (doc.noteSets?.length ?? 1) < 2
												}
												onClick={() => {
													if (
														window.confirm(
															"Delete the current talking-point set?",
														)
													)
														void manageSet("delete");
												}}
											>
												Delete
											</button>
										</div>
									</details>
									{doc.noteSets?.find((s) => s.id === doc.activeSetId)
										?.previous && (
										<button
											disabled={busy || dirty}
											onClick={() => void manageSet("undo")}
										>
											Undo AI changes
										</button>
									)}
								</div>
								<p className="presenter-help">
									Edit here or on your Mac. Save points to sync the same notes
									across devices. Use @object name to reference images, memes,
									sounds, charts, PDF page images, notes or links. Tap once for a
									private preview; tap again to deploy. Hold and drag to place on
									the screen or whiteboard. These notes stay off the recording.
								</p>
								<div className="talking-mode">
									<button
										disabled={busy}
										aria-pressed={editing}
										onClick={() => setEditing(!editing)}
									>
										{editing ? "Preview" : "Edit points"}
									</button>
									{dirty && (
										<button disabled={busy} onClick={() => void save()}>
											{busy ? "Saving…" : "Save points"}
										</button>
									)}
									{dirty && <small>Unsaved edits</small>}
								</div>
								{editing ? (
									<>
										<div className="talking-format">
											<button
												aria-label="Bold text"
												onClick={() => {
													const start =
														textarea.current?.selectionStart ?? caret;
													const end =
														textarea.current?.selectionEnd ?? caret;
													insert(
														`**${notes.body.slice(start, end) || "bold text"}**`,
														start,
														end,
													);
												}}
											>
												<b>B</b>
											</button>
											<button
												aria-label="Bullet point"
												onClick={() => {
													const start =
														notes.body.lastIndexOf("\n", caret - 1) + 1;
													insert("- ", start, start);
												}}
											>
												• List
											</button>
											<button
												onClick={() => {
													setAddingLink(!addingLink);
													setLinkLabel("");
													setLinkURL("");
												}}
											>
												Link
											</button>
											<button onClick={() => setTab("objects")}>
												@ Object
											</button>
										</div>
										{addingLink && (
											<form
												className="talking-link-form"
												onSubmit={(e) => {
													e.preventDefault();
													const url = validNoteLink(linkURL);
													if (!url) {
														setNotice("Enter an http or https link.");
														return;
													}
													insert(
														`[${linkLabel.replace(/[\]\n]/g, " ") || "Open page"}](${url.replace(/\)/g, "%29")})`,
													);
													setAddingLink(false);
												}}
											>
												<input
													aria-label="Link label"
													placeholder="Link label"
													value={linkLabel}
													onChange={(e) => setLinkLabel(e.target.value)}
												/>
												<input
													type="url"
													required
													aria-label="Link address"
													placeholder="https://…"
													value={linkURL}
													onChange={(e) => setLinkURL(e.target.value)}
												/>
												<button type="submit">Insert link</button>
											</form>
										)}
										<textarea
											ref={textarea}
											disabled={busy}
											aria-label="Talking points text"
											className="talking-editor"
											placeholder={
												"- Your first talking point\n- **Key idea** and @object name"
											}
											maxLength={40000}
											value={notes.body}
											onChange={(e) => {
												changed({ ...notes, body: e.target.value });
												setCaret(e.target.selectionStart);
											}}
											onSelect={(e) =>
												setCaret(e.currentTarget.selectionStart)
											}
										/>
										{mention && (
											<div
												className="talking-suggestions"
												aria-label="Object suggestions"
											>
												{objects
													.filter((o) =>
														o.name
															.toLowerCase()
															.includes(mention.query.toLowerCase()),
													)
													.slice(0, 8)
													.map((o) => (
														<button
															key={objectKey(o)}
															onClick={() => insertReference(o)}
														>
															<ObjectIcon kind={o.kind} />
															{o.name}
															<small>{o.kind}</small>
														</button>
													))}
												<button onClick={() => setTab("objects")}>
													Browse / create objects
												</button>
											</div>
										)}
									</>
								) : (
									<div className="talking-reading">
										{!notes.body && (
											<p>
												Your notes are empty. Tap Edit points to add a few
												bullets.
											</p>
										)}
										{talkingPointRows(notes).map((point, index) => (
											<div
												className={`talking-line ${point.covered ? "is-covered" : ""}`}
												key={index}
											>
												<div className="point-actions">
													<input
														type="checkbox"
														aria-label={`Point ${index + 1} covered`}
														checked={point.covered}
														disabled={busy || dirty}
														onChange={() =>
															void save(
																editTalkingPoint(
																	notes,
																	index,
																	"covered",
																),
																true,
															)
														}
													/>
													<button
														aria-label={`Move point ${index + 1} up`}
														disabled={busy || dirty || index === 0}
														onClick={() =>
															void save(
																editTalkingPoint(
																	notes,
																	index,
																	"up",
																),
																true,
															)
														}
													>
														↑
													</button>
													<button
														aria-label={`Move point ${index + 1} down`}
														disabled={
															busy ||
															dirty ||
															index ===
																notes.body.split("\n").length - 1
														}
														onClick={() =>
															void save(
																editTalkingPoint(
																	notes,
																	index,
																	"down",
																),
																true,
															)
														}
													>
														↓
													</button>
												</div>
												<span className="point-body">
													<NoteContent
														text={point.text.replace(/^\s*[-*] /, "")}
														notes={notes}
														objects={objects}
														onUse={activateObject}
														onPreview={onPreview}
														openURL={openURL}
													/>
												</span>
											</div>
										))}
									</div>
								)}
							</>
						)}
					</div>
					{armed && (
						<section className="reference-stage" aria-label="Private reference preview">
							{armed.preview && <img src={armed.preview} alt={armed.name} />}
							<strong>{armed.name}</strong>
							<small>{armed.detail}</small>
							<button disabled={busy} onClick={() => void activateObject(armed)}>
								Deploy reference
							</button>
							<button onClick={() => setArmed(undefined)}>Cancel</button>
						</section>
					)}
					{notice && <footer role="status">{notice}</footer>}
					{dirty && doc.notesVersion !== version && (
						<footer>
							Another device saved newer notes. Your draft is kept here.{" "}
							<button
								onClick={() => {
									setNotes(doc.notes);
									setVersion(doc.notesVersion);
									setDirty(false);
									dirtyRef.current = false;
									setNotice("");
								}}
							>
								Use saved version
							</button>
						</footer>
					)}
				</aside>
			)}
		</div>
	);
}
function NoteContent({
	text,
	notes,
	objects,
	onUse,
	onPreview,
	openURL,
}: {
	text: string;
	notes: TalkingNotes;
	objects: PresenterObject[];
	onUse: (o: PresenterObject, p?: PlacementPoint) => Promise<void>;
	onPreview: (o: PresenterObject | undefined, p?: PlacementPoint) => void;
	openURL: (url: string) => void;
}) {
	return (
		<>
			{noteParts(text).map((part, i) => {
				if (part.type === "bold")
					return (
						<strong key={i}>
							<NoteContent
								text={part.text}
								notes={notes}
								objects={objects}
								onUse={onUse}
								onPreview={onPreview}
								openURL={openURL}
							/>
						</strong>
					);
				if (part.type === "link")
					return (
						<button className="note-link" key={i} onClick={() => openURL(part.url)}>
							{part.text} ↗
						</button>
					);
				if (part.type === "reference") {
					const ref = notes.references[part.text];
					const object = ref && objects.find((o) => objectKey(o) === objectKey(ref));
					return object ? (
						<ReferenceButton
							key={i}
							object={object}
							onUse={onUse}
							onPreview={onPreview}
						/>
					) : (
						<span className="missing-reference" key={i}>
							@{part.text} (unavailable)
						</span>
					);
				}
				return part.text;
			})}
		</>
	);
}
function ReferenceButton({
	object,
	onUse,
	onPreview,
}: {
	object: PresenterObject;
	onUse: (o: PresenterObject, p?: PlacementPoint) => Promise<void>;
	onPreview: (o: PresenterObject | undefined, p?: PlacementPoint) => void;
}) {
	const hold = useRef<ReturnType<typeof setTimeout>>();
	const gesture = useRef<{
		x: number;
		y: number;
		dragging: boolean;
		id: number;
		cancelled: boolean;
	}>();
	const suppressClick = useRef(false);
	useEffect(
		() => () => {
			clearTimeout(hold.current);
		},
		[],
	);
	function cancel() {
		clearTimeout(hold.current);
		if (gesture.current?.dragging) onPreview(undefined);
		gesture.current = undefined;
	}
	function end(e: ReactPointerEvent<HTMLButtonElement>) {
		clearTimeout(hold.current);
		const g = gesture.current;
		gesture.current = undefined;
		if (!g) return;
		if (g.dragging) {
			suppressClick.current = true;
			onPreview(undefined);
			const target = document.elementFromPoint(e.clientX, e.clientY);
			if (target instanceof HTMLCanvasElement)
				void onUse(object, { x: e.clientX, y: e.clientY });
		} else if (g.cancelled) suppressClick.current = true;
	}
	return (
		<button
			className={`talking-reference type-${object.kind}`}
			title={`${object.name} · ${object.kind}. Tap to preview privately, then tap again to deploy. Hold and drag to position.`}
			onContextMenu={(e) => e.preventDefault()}
			onPointerDown={(e) => {
				if (e.button !== 0) return;
				suppressClick.current = false;
				gesture.current = {
					x: e.clientX,
					y: e.clientY,
					id: e.pointerId,
					dragging: false,
					cancelled: false,
				};
				e.currentTarget.setPointerCapture(e.pointerId);
				hold.current = setTimeout(() => {
					if (gesture.current && !gesture.current.cancelled) {
						gesture.current.dragging = true;
						onPreview(object, { x: gesture.current.x, y: gesture.current.y });
					}
				}, 350);
			}}
			onPointerMove={(e) => {
				const g = gesture.current;
				if (!g) return;
				if (g.dragging) {
					e.preventDefault();
					onPreview(object, { x: e.clientX, y: e.clientY });
				} else if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 10) {
					g.cancelled = true;
					clearTimeout(hold.current);
				}
			}}
			onPointerUp={end}
			onPointerCancel={cancel}
			onLostPointerCapture={cancel}
			onClick={() => {
				if (suppressClick.current) {
					suppressClick.current = false;
					return;
				}
				void onUse(object);
			}}
		>
			<ObjectIcon kind={object.kind} />@{object.name}
		</button>
	);
}
