import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { BoardAPI } from "../../types/board";
import type { PresenterDocument, PresenterPDF, PresenterObject } from "../../types/presenter";
import type { PresentationDraft, PresentationJob } from "../../types/presentationDraft";
import { openPrivatePDF, pdfText, selectedPDFPages, extractPDFPages } from "./privatePDF";

function PDFThumbnail({
	pdf,
	page,
	selected,
	onClick,
}: {
	pdf: PDFDocumentProxy;
	page: number;
	selected: boolean;
	onClick: () => void;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		let cancelled = false;
		let task:
			| ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
			| undefined;
		void pdf
			.getPage(page)
			.then((p) => {
				if (cancelled || !canvas.current) return;
				const viewport = p.getViewport({ scale: 72 / p.getViewport({ scale: 1 }).width });
				canvas.current.width = viewport.width;
				canvas.current.height = viewport.height;
				task = p.render({ canvas: canvas.current, viewport });
				return task.promise;
			})
			.catch(() => {
				/* The full-page viewer reports render errors; thumbnail failure is non-blocking. */
			});
		return () => {
			cancelled = true;
			task?.cancel();
		};
	}, [pdf, page]);
	return (
		<button
			className="pdf-thumbnail"
			aria-label={`View PDF page ${page}`}
			aria-pressed={selected}
			onClick={onClick}
			data-help="Jump to this PDF page. Only you and your paired devices can see the private document."
		>
			<canvas ref={canvas} />
			<span>{page}</span>
		</button>
	);
}
function readPosition(id: string) {
	try {
		const data = JSON.parse(localStorage.getItem(`mr-private-pdf:${id}`) || "null");
		return {
			page: Math.max(1, Number(data?.page) || 1),
			zoom: [1, 1.5, 2].includes(data?.zoom) ? data.zoom : 1,
		};
	} catch {
		return { page: 1, zoom: 1 };
	}
}

export function PrivatePDFPanel({
	transport,
	document: doc,
	dirty,
	onChanged,
	onDone,
	objects = [],
}: {
	transport: BoardAPI;
	document: PresenterDocument;
	dirty: boolean;
	objects?: PresenterObject[];
	onChanged: (d: PresenterDocument) => void;
	onDone: () => void;
}) {
	const [selected, setSelected] = useState(doc.pdfs?.[0]?.id ?? "");
	const [pdf, setPDF] = useState<PDFDocumentProxy>();
	const [page, setPage] = useState(1),
		[zoom, setZoom] = useState(1);
	const [query, setQuery] = useState("");
	const [research, setResearch] = useState(false);
	const [extracting, setExtracting] = useState(false);
	const [pages, setPages] = useState("1");
	const [goal, setGoal] = useState("Explain the key ideas clearly"),
		[audience, setAudience] = useState("General audience"),
		[minutes, setMinutes] = useState(5);
	const [ocr, setOCR] = useState(false),
		[memes, setMemes] = useState(true),
		[sounds, setSounds] = useState(false);
	const [notice, setNotice] = useState(""),
		[busy, setBusy] = useState(false),
		[setup, setSetup] = useState(false);
	const [job, setJob] = useState<PresentationJob>({ id: "", phase: "idle", message: "" });
	const [draft, setDraft] = useState<PresentationDraft>();
	const [excluded, setExcluded] = useState<string[]>([]);
	const viewer = useRef<HTMLDivElement>(null);
	const [viewerWidth, setViewerWidth] = useState(0);
	const canvas = useRef<HTMLCanvasElement>(null);
	const renderedPage = useRef("");
	const loadedID = useRef("");
	const generation = useRef(0);

	const metadata = doc.pdfs?.find((p) => p.id === selected);
	const pdfId = metadata?.id;
	useEffect(() => {
		if (!doc.pdfs?.some((p) => p.id === selected)) setSelected(doc.pdfs?.[0]?.id ?? "");
	}, [doc.pdfs, selected]);
	useEffect(() => {
		const accept = (j: PresentationJob) => {
			setJob(j);
			if (j.phase === "idle") setDraft(undefined);
			if (j.phase === "ready" && j.draft) {
				setDraft(j.draft);
				setExcluded([]);
			}
		};
		const off = transport.on<PresentationJob>("presentationJob", accept);
		void transport
			.request<PresentationJob>("presentationJob")
			.then(accept)
			.catch((e) => setNotice(String(e)));
		return off;
	}, [transport]);
	useEffect(() => {
		loadedID.current = "";
		if (!pdfId) {
			setPDF(undefined);
			return;
		}
		let cancelled = false,
			loaded: PDFDocumentProxy | undefined;
		setPDF(undefined);
		setNotice("Opening private PDF…");
		void transport
			.request<string>("readPrivatePDF", pdfId)
			.then((data) => openPrivatePDF(Uint8Array.from(atob(data), (c) => c.charCodeAt(0))))
			.then((value) => {
				loaded = value;
				if (cancelled) {
					void value.loadingTask.destroy();
					return;
				}
				loadedID.current = pdfId;
				setPDF(value);
				const position = readPosition(pdfId);
				setPage(Math.min(value.numPages, position.page));
				setZoom(position.zoom);
				setPages(`1-${Math.min(value.numPages, 6)}`);
				setNotice("");
			})
			.catch(() => {
				if (!cancelled)
					setNotice("Unable to open PDF. Reconnect, or import an unlocked, valid PDF.");
			});
		return () => {
			cancelled = true;
			void loaded?.loadingTask.destroy();
		};
	}, [pdfId, transport]);
	useEffect(() => {
		const container = viewer.current;
		if (!pdf || !container) return;
		const observer = new ResizeObserver(() => {
			// Zero means a hidden tab/minimized panel. Keep the last readable canvas.
			const width = container.clientWidth;
			if (width > 0) setViewerWidth(width);
		});
		observer.observe(container);
		return () => observer.disconnect();
	}, [pdf]);
	useEffect(() => {
		if (!pdf || !canvas.current || !viewerWidth || loadedID.current !== selected) return;
		let cancelled = false,
			task:
				| ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
				| undefined;
		const target = canvas.current;
		try {
			localStorage.setItem(`mr-private-pdf:${selected}`, JSON.stringify({ page, zoom }));
		} catch {
			/* Reading still works when storage is unavailable. */
		}
		void pdf
			.getPage(page)
			.then((p) => {
				if (cancelled) return;
				const base = p.getViewport({ scale: 1 });
				const width = viewerWidth * zoom;
				const viewport = p.getViewport({ scale: width / base.width });
				const dpr = Math.min(window.devicePixelRatio || 1, 2);
				const container = viewer.current;
				const samePage = renderedPage.current === `${selected}:${page}`;
				const ratio = viewport.width / (parseFloat(target.style.width) || viewport.width);
				const scroll = {
					left: samePage ? (container?.scrollLeft ?? 0) * ratio : 0,
					top: samePage ? (container?.scrollTop ?? 0) * ratio : 0,
				};
				renderedPage.current = `${selected}:${page}`;
				target.width = Math.ceil(viewport.width * dpr);
				target.height = Math.ceil(viewport.height * dpr);
				target.style.width = `${viewport.width}px`;
				target.style.height = `${viewport.height}px`;
				container?.scrollTo(scroll);
				task = p.render({ canvas: target, viewport, transform: [dpr, 0, 0, dpr, 0, 0] });
				return task.promise;
			})
			.catch(() => {
				if (!cancelled) setNotice("This page could not be rendered.");
			});
		return () => {
			cancelled = true;
			task?.cancel();
		};
	}, [pdf, page, zoom, selected, viewerWidth]);
	useEffect(
		() => () => {
			generation.current++;
		},
		[],
	);
	async function upload(file: File) {
		setBusy(true);
		setNotice("Reading PDF locally…");
		let parsed: PDFDocumentProxy | undefined;
		try {
			if (file.size > 6 * 1024 * 1024) throw Error("Choose a PDF smaller than 6 MB.");
			const bytes = new Uint8Array(await file.arrayBuffer());
			parsed = await openPrivatePDF(bytes.slice());
			if (parsed.numPages > 500) throw Error("Choose a PDF with at most 500 pages.");
			const data = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(String(reader.result).split(",")[1]);
				reader.onerror = () => reject(Error("Could not read PDF."));
				reader.readAsDataURL(file);
			});
			const saved = await transport.request<PresenterPDF>("importPrivatePDF", {
				name: file.name.slice(0, 120),
				pages: parsed.numPages,
				data,
			});
			onChanged(await transport.request<PresenterDocument>("presenterInfo"));
			setSelected(saved.id);
			setNotice("PDF saved privately on your Mac and available to paired iPads.");
		} catch (e) {
			setNotice(
				e instanceof Error
					? e.message
					: "Unable to import PDF. Unlock password-protected PDFs first.",
			);
		} finally {
			void parsed?.loadingTask.destroy();
			setBusy(false);
		}
	}
	async function analyze() {
		if (!pdf || !metadata) return;
		setBusy(true);
		setExtracting(true);
		const run = ++generation.current;
		try {
			const selection = selectedPDFPages(pages, pdf.numPages);
			const content = await extractPDFPages(pdf, selection, ocr, setNotice);
			if (run !== generation.current) return;
			await transport.request("draftPresentation", {
				id: crypto.randomUUID(),
				pdfId: metadata.id,
				baseVersion: doc.notesVersion,
				goal,
				audience,
				minutes,
				pages: content,
				memes,
				sounds,
				research,
			});
			setNotice("");
		} catch (e) {
			setNotice(String(e));
		} finally {
			if (run === generation.current) {
				setBusy(false);
				setExtracting(false);
			}
		}
	}
	async function apply(mode: "add" | "replace" | "new") {
		if (!draft) return;
		setBusy(true);
		try {
			const next = await transport.request<PresenterDocument>("applyPresentationDraft", {
				id: job.id,
				version: draft.baseVersion,
				mode,
				name: draft.title,
				texts: draft.points.map((p) => p.text),
				excluded,
			});
			onChanged(next);
			setDraft(undefined);
			onDone();
		} catch (e) {
			setNotice(String(e));
		} finally {
			setBusy(false);
		}
	}
	return (
		<section className="private-pdf-panel" aria-label="Private presentation documents">
			<p className="presenter-help">
				Presenter only · PDFs, notes and drafts are not recorded. Import on either device
				and read on your iPad.
			</p>
			<div className="pdf-toolbar">
				<label
					className="presenter-upload"
					data-help="Import a private PDF from this device. It is saved on your Mac and available to paired iPads; up to 6 MB and 500 pages."
				>
					Import PDF
					<input
						type="file"
						accept="application/pdf,.pdf"
						disabled={busy || (doc.pdfs?.length ?? 0) >= 10}
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							if (file) void upload(file);
						}}
					/>
				</label>
				{metadata && (
					<button
						disabled={busy}
						onClick={() => {
							if (window.confirm(`Remove ${metadata.name} from this presentation?`))
								void transport
									.request<PresenterDocument>("removePresenterPDF", metadata.id)
									.then((next) => {
										onChanged(next);
										setSelected(next.pdfs?.[0]?.id ?? "");
									})
									.catch((e) => setNotice(String(e)));
						}}
					>
						Remove PDF
					</button>
				)}
			</div>
			{!!doc.pdfs?.length && (
				<select
					aria-label="Private PDF"
					value={selected}
					onChange={(e) => setSelected(e.target.value)}
				>
					{doc.pdfs.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</select>
			)}
			{pdf && (
				<>
					<div className="pdf-toolbar">
						<button
							aria-label="Previous PDF page"
							disabled={page <= 1}
							onClick={() => setPage(page - 1)}
						>
							←
						</button>
						<label>
							Page{" "}
							<input
								aria-label="PDF page number"
								type="number"
								min={1}
								max={pdf.numPages}
								value={page}
								onChange={(e) =>
									setPage(
										Math.max(
											1,
											Math.min(pdf.numPages, Number(e.target.value) || 1),
										),
									)
								}
							/>
						</label>
						<span>/ {pdf.numPages}</span>
						<button
							aria-label="Next PDF page"
							disabled={page >= pdf.numPages}
							onClick={() => setPage(page + 1)}
						>
							→
						</button>
						<select
							aria-label="PDF zoom"
							value={zoom}
							onChange={(e) => setZoom(Number(e.target.value))}
						>
							{[1, 1.5, 2].map((v) => (
								<option key={v} value={v}>
									{v === 1 ? "Fit width" : `${v * 100}%`}
								</option>
							))}
						</select>
					</div>
					<form
						className="pdf-toolbar"
						onSubmit={async (e) => {
							e.preventDefault();
							if (!query.trim()) return;
							setBusy(true);
							try {
								for (let offset = 1; offset <= pdf.numPages; offset++) {
									const n = ((page - 1 + offset) % pdf.numPages) + 1;
									if (
										(await pdfText(pdf, n))
											.toLowerCase()
											.includes(query.toLowerCase())
									) {
										setPage(n);
										setNotice(`Found on page ${n}.`);
										return;
									}
								}
								setNotice(
									"No matching text. Search works on selectable text; scanned pages can be read by AI with Read scanned pages.",
								);
							} catch (e) {
								setNotice(String(e));
							} finally {
								setBusy(false);
							}
						}}
					>
						<input
							aria-label="Search PDF text"
							placeholder="Find in PDF…"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
						<button disabled={busy}>Find next</button>
					</form>
					<div className="pdf-thumbnails" aria-label="Nearby PDF pages">
						{Array.from(
							{ length: Math.min(5, pdf.numPages) },
							(_, i) => Math.max(1, Math.min(page - 2, pdf.numPages - 4)) + i,
						).map((n) => (
							<PDFThumbnail
								key={n}
								pdf={pdf}
								page={n}
								selected={page === n}
								onClick={() => setPage(n)}
							/>
						))}
					</div>
					<div className="private-pdf-canvas" ref={viewer}>
						<canvas ref={canvas} aria-label={`Private PDF page ${page}`} />
					</div>
					<button aria-expanded={setup} onClick={() => setSetup(!setup)}>
						Make presentation with AI
					</button>
					{setup && (
						<div className="pdf-draft-form">
							<label>
								Goal
								<input
									data-help="Describe the main idea you want to explain. AI keeps the outline focused on this goal."
									value={goal}
									onChange={(e) => setGoal(e.target.value)}
									maxLength={1000}
								/>
							</label>
							<label>
								Audience
								<input
									data-help="Choose who will watch so AI can use the right level of detail."
									value={audience}
									onChange={(e) => setAudience(e.target.value)}
									maxLength={200}
								/>
							</label>
							<div className="pdf-toolbar">
								<label>
									Minutes
									<input
										type="number"
										min={1}
										max={60}
										data-help="Set how long you want to speak. AI adjusts the number and length of talking points."
										value={minutes}
										onChange={(e) => setMinutes(Number(e.target.value))}
									/>
								</label>
								<label>
									Pages
									<input
										data-help="Select up to twelve pages, such as 1-4, 7. Fewer pages reduce API usage and keep the draft focused."
										value={pages}
										onChange={(e) => setPages(e.target.value)}
										placeholder="1-6, 9"
									/>
								</label>
							</div>
							<label>
								<input
									type="checkbox"
									data-help="Send page images only when selectable text is missing. Limited to three scanned pages per request to control cost."
									checked={ocr}
									onChange={(e) => setOCR(e.target.checked)}
								/>
								Read scanned pages (up to 3 images)
							</label>
							<label>
								<input
									type="checkbox"
									data-help="Allow a few relevant memes from your existing library to be suggested. They remain optional and never play automatically."
									checked={memes}
									onChange={(e) => setMemes(e.target.checked)}
								/>
								Suggest matching library memes
							</label>
							<label>
								<input
									type="checkbox"
									data-help="Allow existing soundboard clips as optional references. They do not play until you use the reference during your presentation."
									checked={sounds}
									onChange={(e) => setSounds(e.target.checked)}
								/>
								Suggest library sounds
							</label>
							<label>
								<input
									type="checkbox"
									checked={research}
									onChange={(e) => setResearch(e.target.checked)}
									data-help="Allow one web search to suggest supporting source links. Adds a search-tool charge. Review each source before presenting."
								/>
								Find supporting sources (one search)
							</label>
							<p className="presenter-help">
								Quick draft · GPT-6.1 Sol. Estimated $0.03–$0.30 per text draft;
								scanned pages and optional search can cost more. Actual cost depends
								on tokens and current OpenAI rates.
							</p>
							<p className="presenter-help">
								Sends selected page text, existing notes and library names/tags to
								OpenAI. One request, up to 12 pages and 6,000 output tokens; scanned
								pages add image input. Uses your API credits. Repeating an unchanged
								request uses the cached draft until the app closes. Browsing is
								optional; no media generation.
							</p>
							{dirty && (
								<p>
									Save your current talking-point edits before drafting or
									applying.
								</p>
							)}
							<button
								disabled={dirty || busy || job.phase === "working"}
								onClick={() => void analyze()}
							>
								Draft talking points
							</button>
						</div>
					)}
				</>
			)}
			{(extracting || job.phase === "working") && (
				<button
					onClick={() => {
						generation.current++;
						setBusy(false);
						setExtracting(false);
						setNotice("Cancelled. Saved notes are unchanged.");
						void transport
							.request("cancelPresentationDraft")
							.catch((e) => setNotice(String(e)));
					}}
				>
					Cancel analysis
				</button>
			)}
			{job.message && <p role="status">{job.message}</p>}
			{draft && (
				<section className="presentation-review" aria-label="Review presentation draft">
					<h3>Review before saving</h3>
					<input
						aria-label="Draft title"
						value={draft.title}
						maxLength={80}
						onChange={(e) => setDraft({ ...draft, title: e.target.value })}
					/>
					<p>{draft.recommendation}</p>
					{draft.warnings.map((w, i) => (
						<p key={i}>{w}</p>
					))}
					{draft.points.map((point, i) => (
						<article key={i}>
							<label>
								Point {i + 1} · PDF p. {point.page}
								<textarea
									aria-label={`Draft point ${i + 1}`}
									data-help="Edit this suggested talking point before saving it. Its PDF citation and selected object references are kept."
									value={point.text}
									maxLength={1500}
									onChange={(e) =>
										setDraft({
											...draft,
											points: draft.points.map((p, j) =>
												j === i ? { ...p, text: e.target.value } : p,
											),
										})
									}
								/>
							</label>
							<details>
								<summary>Source evidence</summary>
								<p>{point.evidence}</p>
							</details>
							{point.suggestions.map((s, j) => {
								const key = `${i}:${j}`;
								return (
									<div className="pdf-suggestion" key={key}>
										<label>
											<input
												type="checkbox"
												data-help="Include this suggested object when saving the draft. Uncheck it to keep only the talking point."
												checked={!excluded.includes(key)}
												onChange={(e) =>
													setExcluded(
														e.target.checked
															? excluded.filter((k) => k !== key)
															: [...excluded, key],
													)
												}
											/>
											{s.kind === "existing"
												? s.target.split(":")[0]
												: s.kind}{" "}
											· {s.label}
										</label>
										<details>
											<summary>Preview suggestion</summary>
											{s.kind === "existing" &&
												objects.find(
													(o) => `${o.kind}:${o.id}` === s.target,
												)?.preview && (
													<img
														className="pdf-object-preview"
														alt={s.label}
														src={
															objects.find(
																(o) =>
																	`${o.kind}:${o.id}` ===
																	s.target,
															)?.preview
														}
													/>
												)}
											{s.kind === "existing" &&
												objects.find(
													(o) => `${o.kind}:${o.id}` === s.target,
												)?.containsAudio && (
													<small>
														Contains audio · uses this meme’s saved
														sound settings
													</small>
												)}
											{s.chart ? (
												<table>
													<thead>
														<tr>
															<th>Label</th>
															<th>Value {s.chart.unit}</th>
														</tr>
													</thead>
													<tbody>
														{s.chart.labels.map((l, k) => (
															<tr key={k}>
																<td>{l}</td>
																<td>{s.chart?.values[k]}</td>
															</tr>
														))}
													</tbody>
												</table>
											) : (
												<p>
													{s.kind === "link"
														? s.target
														: "Uses an existing object from your library. Nothing plays until you tap its reference while presenting."}
												</p>
											)}
										</details>
									</div>
								);
							})}
						</article>
					))}
					<p className="presenter-help">
						Charts are saved as private drafts. Review their labels and numbers in
						Objects → chart settings before showing them. References mark each attached
						graphic, meme or sound in your notes.
					</p>
					{draft.baseVersion !== doc.notesVersion && (
						<p role="alert">
							Notes changed on another device. This draft is kept for comparison;
							prepare a fresh draft before applying.
						</p>
					)}
					<div className="pdf-toolbar">
						{(
							[
								["add", "Add to notes"],
								["replace", "Replace notes"],
								["new", "Save as new set"],
							] as const
						).map(([mode, label]) => (
							<button
								key={mode}
								disabled={dirty || busy || draft.baseVersion !== doc.notesVersion}
								onClick={() => void apply(mode)}
							>
								{label}
							</button>
						))}
					</div>
					<button onClick={() => setDraft(undefined)}>Dismiss draft</button>
				</section>
			)}
			{notice && <p role="status">{notice}</p>}
		</section>
	);
}
