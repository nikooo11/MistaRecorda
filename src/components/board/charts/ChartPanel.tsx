import { useEffect, useRef, useState } from "react";
import {
	ChartLineUpIcon,
	XIcon,
	MonitorIcon,
	ImageIcon,
	UploadSimpleIcon,
	PencilSimpleIcon,
	PlayIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import type { BoardAPI, BoardState } from "../../../types/board";
import type { ChartDocument, ChartKind } from "../../../types/charts";
import { emptyChartData, isEditedFromSource } from "./chartModel";
import { chartDataURL } from "./chartRender";
import { ChartEditor } from "./ChartEditor";
import { presenterId } from "../presenterModel";
import type { ChartsState } from "./useCharts";

export interface ChartImport {
	dataURL: string;
	name?: string;
	source?: { url?: string; publisher?: string; notes?: string };
	title?: string;
}
type Crop = { x: number; y: number; w: number; h: number };
const MAX_SIDE = 2048;

/** Crop in image pixels and re-encode, so only the selected chart region is ever uploaded. */
export async function cropImage(dataURL: string, crop: Crop | null): Promise<string> {
	const image = new Image();
	image.src = dataURL;
	await image.decode();
	const box = crop ?? { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
	const scale = Math.min(1, MAX_SIDE / Math.max(box.w, box.h));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(box.w * scale));
	canvas.height = Math.max(1, Math.round(box.h * scale));
	const ctx = canvas.getContext("2d")!;
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(image, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
	const png = canvas.toDataURL("image/png");
	return png.length < 4.5 * 1024 * 1024 ? png : canvas.toDataURL("image/jpeg", 0.9);
}
const readFile = (file: File) =>
	new Promise<string>((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result));
		r.onerror = reject;
		r.readAsDataURL(file);
	});

export function ChartPanel({
	transport,
	state,
	charts,
	initialImport,
	initialEditId,
	onPlace,
	onPresent,
	onClose,
}: {
	transport: BoardAPI;
	state: BoardState;
	charts: ChartsState;
	initialImport?: ChartImport;
	initialEditId?: string;
	onPlace: (chart: ChartDocument, shadow?: boolean) => void;
	onPresent: (chart: ChartDocument) => void;
	onClose: () => void;
}) {
	const [view, setView] = useState<"list" | "import" | "crop" | "edit">(
		initialImport ? "crop" : initialEditId ? "edit" : "list",
	);
	const [editId, setEditId] = useState(initialEditId);
	const [image, setImage] = useState<ChartImport | undefined>(initialImport);
	const [crop, setCrop] = useState<Crop | null>(null);
	const [meta, setMeta] = useState({
		url: "",
		publisher: "",
		published: "",
		dateRange: "",
		context: "",
	});
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [jobId, setJobId] = useState("");
	const [manualKind, setManualKind] = useState<ChartKind>("bar");
	const [, tick] = useState(0);
	useEffect(() => {
		if (initialImport) {
			setImage(initialImport);
			setView("crop");
			setMeta((m) => ({
				...m,
				url: initialImport.source?.url ?? "",
				publisher: initialImport.source?.publisher ?? "",
				context: initialImport.title ?? "",
			}));
		}
	}, [initialImport]);
	useEffect(() => {
		if (initialEditId) {
			setEditId(initialEditId);
			setView("edit");
		}
	}, [initialEditId]);
	const job = charts.job;
	const analyzing = job.phase === "analyzing" && job.jobId === jobId;
	useEffect(() => {
		if (!jobId || job.jobId !== jobId) return;
		if (job.phase === "ready" && job.chartId) {
			setEditId(job.chartId);
			setView("edit");
			setJobId("");
		} else if (job.phase === "error") {
			setError(job.error);
			setJobId("");
		}
	}, [job, jobId]);
	useEffect(() => {
		if (!analyzing) return;
		const t = setInterval(() => tick((n) => n + 1), 1000);
		return () => clearInterval(t);
	}, [analyzing]);
	const run = async (work: () => Promise<void>) => {
		setBusy(true);
		setError("");
		try {
			await work();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};
	const editing = charts.charts.find((c) => c.id === editId);
	const source = () => ({
		url: meta.url.trim(),
		publisher: meta.publisher.trim(),
		published: meta.published.trim(),
		dateRange: meta.dateRange.trim(),
	});
	return (
		<aside
			className={`board-tray chart-panel ${view === "edit" || view === "crop" ? "is-wide" : ""}`}
			role="dialog"
			aria-label="AI Chart"
			onKeyDown={(e) => e.stopPropagation()}
		>
			<header>
				<strong>
					<ChartLineUpIcon size={17} /> AI Chart
				</strong>
				{view !== "list" && (
					<button
						disabled={analyzing}
						onClick={() => {
							setView("list");
							setError("");
						}}
					>
						All charts
					</button>
				)}
				<button aria-label="Close AI Chart" onClick={onClose}>
					<XIcon size={16} />
				</button>
			</header>
			{view === "list" && (
				<>
					<button className="chart-new" onClick={() => setView("import")}>
						＋ New chart from a screenshot or data
					</button>
					<div className="chart-list">
						{charts.charts.map((c) => (
							<article key={c.id} className="chart-card">
								<img src={chartDataURL(c, 240, 150)} alt="" />
								<div>
									<strong>{c.name}</strong>
									<small>
										{c.status === "reviewed" ? "Confirmed" : "Draft · private"}
										{isEditedFromSource(c) ? " · Edited from source" : ""}
										{` · ${c.data.kind}`}
									</small>
									<span className="chart-card-actions">
										<button
											title="Tap the canvas to place. Charts start as a shadow (iPad only)."
											onClick={() => onPlace(c)}
										>
											Place
										</button>
										<button
											aria-label={`Present ${c.name}`}
											onClick={() => onPresent(c)}
										>
											<PlayIcon size={14} /> Present
										</button>
										<button
											aria-label={`Edit ${c.name}`}
											onClick={() => {
												setEditId(c.id);
												setView("edit");
											}}
										>
											<PencilSimpleIcon size={14} /> Edit
										</button>
										<button
											aria-label={`Delete ${c.name}`}
											onClick={() =>
												confirm(
													`Delete “${c.name}”? Placed copies will show as unavailable.`,
												) &&
												void run(
													async () =>
														void (await transport.request(
															"chartRemove",
															c.id,
														)),
												)
											}
										>
											<TrashIcon size={14} />
										</button>
									</span>
								</div>
							</article>
						))}
					</div>
					{!charts.charts.length && (
						<p>
							No charts yet. Capture a chart from a webpage, pick a standby image,
							upload a screenshot, or type the numbers.
						</p>
					)}
				</>
			)}
			{view === "import" && (
				<div className="chart-import">
					<p>
						Choose the chart or statistic. You will crop it next. Nothing is uploaded
						until you tap Analyze.
					</p>
					<button
						disabled={busy}
						onClick={() =>
							void run(async () => {
								const shot = await transport.request<ChartImport>("chartCapture");
								setImage(shot);
								setCrop(null);
								setView("crop");
							})
						}
					>
						<MonitorIcon size={18} /> {busy ? "Capturing…" : "Capture Mac screen"}
					</button>
					<label className="board-import">
						<UploadSimpleIcon size={18} /> Upload screenshot (PNG, JPEG, WebP)
						<input
							type="file"
							accept="image/png,image/jpeg,image/webp"
							onChange={(e) => {
								const file = e.target.files?.[0];
								e.target.value = "";
								if (!file) return;
								void run(async () => {
									if (
										!["image/png", "image/jpeg", "image/webp"].includes(
											file.type,
										)
									)
										throw Error("Choose a PNG, JPEG or WebP screenshot.");
									if (file.size > 12 * 1024 * 1024)
										throw Error("Choose an image under 12 MB.");
									setImage({ dataURL: await readFile(file), name: file.name });
									setCrop(null);
									setView("crop");
								});
							}}
						/>
					</label>
					{Object.values(state.assets).length > 0 && (
						<details>
							<summary>
								<ImageIcon size={16} /> Use a standby image
							</summary>
							<div className="chart-assets">
								{Object.values(state.assets).map((a) => (
									<button
										key={a.id}
										title={a.name}
										onClick={() => {
											setImage({ dataURL: a.dataURL, name: a.name });
											setCrop(null);
											setView("crop");
										}}
									>
										<img src={a.dataURL} alt={a.name || "Standby image"} />
									</button>
								))}
							</div>
						</details>
					)}
					<div className="chart-manual">
						<select
							aria-label="Chart type for manual entry"
							value={manualKind}
							onChange={(e) => setManualKind(e.target.value as ChartKind)}
						>
							<option value="line">Line</option>
							<option value="bar">Bar</option>
							<option value="pie">Pie / donut</option>
							<option value="card">Statistic card</option>
						</select>
						<button
							disabled={busy}
							onClick={() =>
								void run(async () => {
									const doc = await transport.request<ChartDocument>(
										"chartCreate",
										{
											data: { ...emptyChartData(manualKind), title: "" },
											name: "New chart",
										},
									);
									setEditId(doc.id);
									setView("edit");
								})
							}
						>
							Type the numbers
						</button>
					</div>
				</div>
			)}
			{view === "crop" && image && (
				<div className="chart-crop">
					<p>
						Drag across the chart to crop it. Include its title, axes, legend and source
						line, but only one chart.
					</p>
					<CropBox dataURL={image.dataURL} crop={crop} onCrop={setCrop} />
					<div className="chart-fields">
						<label>
							Source link (optional)
							<input
								value={meta.url}
								inputMode="url"
								placeholder="https://…"
								onChange={(e) => setMeta({ ...meta, url: e.target.value })}
							/>
						</label>
						<div className="chart-inline">
							<label>
								Publisher
								<input
									value={meta.publisher}
									maxLength={120}
									onChange={(e) =>
										setMeta({ ...meta, publisher: e.target.value })
									}
								/>
							</label>
							<label>
								Published
								<input
									value={meta.published}
									maxLength={60}
									onChange={(e) =>
										setMeta({ ...meta, published: e.target.value })
									}
								/>
							</label>
							<label>
								Date range
								<input
									value={meta.dateRange}
									maxLength={120}
									onChange={(e) =>
										setMeta({ ...meta, dateRange: e.target.value })
									}
								/>
							</label>
						</div>
						<label>
							What does it show? (optional hint for the AI)
							<input
								value={meta.context}
								maxLength={600}
								placeholder="e.g. US unemployment rate, percent"
								onChange={(e) => setMeta({ ...meta, context: e.target.value })}
							/>
						</label>
					</div>
					{analyzing ? (
						<div className="chart-analyzing" role="status">
							Reading the chart… {Math.round((Date.now() - job.started) / 1000)}s
							<button
								onClick={() =>
									void transport.request("chartCancel").then(() => setJobId(""))
								}
							>
								Cancel
							</button>
						</div>
					) : (
						<div className="chart-crop-actions">
							<button
								className="primary"
								disabled={busy || !charts.hasKey}
								title={
									charts.hasKey
										? ""
										: "Add an OpenAI API key on the Mac in Drawing → Setup → AI figures."
								}
								onClick={() =>
									void run(async () => {
										const dataURL = await cropImage(image.dataURL, crop);
										const id = `chart-${presenterId().slice(0, 8)}`;
										setJobId(id);
										await transport
											.request("chartAnalyze", {
												jobId: id,
												dataURL,
												context: meta.context,
												source: source(),
											})
											.catch((e) => {
												setJobId("");
												throw e;
											});
									})
								}
							>
								Analyze chart
							</button>
							<button
								disabled={busy}
								onClick={() =>
									void run(async () => {
										const sourceImage = await cropImage(image.dataURL, crop);
										const doc = await transport.request<ChartDocument>(
											"chartCreate",
											{
												data: {
													...emptyChartData(manualKind),
													title: image.title ?? "",
												},
												name: (
													image.title ||
													image.name ||
													"New chart"
												).slice(0, 80),
												source: source(),
												sourceImage,
											},
										);
										setEditId(doc.id);
										setView("edit");
									})
								}
							>
								Enter values manually
							</button>
							<small>
								{charts.hasKey
									? "Analyze uploads only the cropped image to your OpenAI account and uses API credits (one request). You review every value before it can be shown."
									: "No OpenAI key on the Mac. You can still type the values next to the screenshot."}
							</small>
						</div>
					)}
				</div>
			)}
			{view === "edit" && editing && (
				<ChartEditor
					key={editing.id}
					transport={transport}
					chart={editing}
					onClose={() => setView("list")}
					onPlace={onPlace}
				/>
			)}
			{view === "edit" && !editing && charts.loaded && <p>This chart was removed.</p>}
			{error && (
				<output role="alert" className="chart-error">
					{error}
				</output>
			)}
		</aside>
	);
}

function CropBox({
	dataURL,
	crop,
	onCrop,
}: {
	dataURL: string;
	crop: Crop | null;
	onCrop: (c: Crop | null) => void;
}) {
	const img = useRef<HTMLImageElement>(null);
	const start = useRef<{ x: number; y: number; id: number } | null>(null);
	const [live, setLive] = useState<Crop | null>(null);
	const toImage = (clientX: number, clientY: number) => {
		const r = img.current!.getBoundingClientRect();
		const sx = img.current!.naturalWidth / r.width,
			sy = img.current!.naturalHeight / r.height;
		return {
			x: Math.max(0, Math.min(img.current!.naturalWidth, (clientX - r.left) * sx)),
			y: Math.max(0, Math.min(img.current!.naturalHeight, (clientY - r.top) * sy)),
		};
	};
	const shown = live ?? crop;
	const pct = (c: Crop) => {
		const W = img.current?.naturalWidth || 1,
			H = img.current?.naturalHeight || 1;
		return {
			left: `${(c.x / W) * 100}%`,
			top: `${(c.y / H) * 100}%`,
			width: `${(c.w / W) * 100}%`,
			height: `${(c.h / H) * 100}%`,
		};
	};
	return (
		<div className="chart-cropbox">
			<div className="chart-cropbox-stage">
				{/* The wrapper is exactly the image's size, so pointer coordinates map 1:1 (no letterboxing). */}
				<div
					className="chart-cropbox-image"
					onPointerDown={(e) => {
						e.preventDefault();
						e.currentTarget.setPointerCapture(e.pointerId);
						const p = toImage(e.clientX, e.clientY);
						start.current = { ...p, id: e.pointerId };
						setLive({ ...p, w: 0, h: 0 });
					}}
					onPointerMove={(e) => {
						if (!start.current || start.current.id !== e.pointerId) return;
						const p = toImage(e.clientX, e.clientY);
						setLive({
							x: Math.min(p.x, start.current.x),
							y: Math.min(p.y, start.current.y),
							w: Math.abs(p.x - start.current.x),
							h: Math.abs(p.y - start.current.y),
						});
					}}
					onPointerUp={() => {
						start.current = null;
						if (live && live.w > 12 && live.h > 12)
							onCrop({
								x: Math.round(live.x),
								y: Math.round(live.y),
								w: Math.round(live.w),
								h: Math.round(live.h),
							});
						setLive(null);
					}}
				>
					<img ref={img} src={dataURL} alt="Screenshot to crop" draggable={false} />
					{shown && <span className="chart-crop-rect" style={pct(shown)} />}
				</div>
			</div>
			<small>
				{crop ? `Cropped to ${crop.w} × ${crop.h} px.` : "Whole image selected."}{" "}
				{crop && (
					<button type="button" onClick={() => onCrop(null)}>
						Use whole image
					</button>
				)}
			</small>
		</div>
	);
}
