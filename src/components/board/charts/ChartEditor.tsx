import { useEffect, useMemo, useRef, useState } from "react";
import {
	ArrowCounterClockwiseIcon,
	ArrowClockwiseIcon,
	TrashIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import type { BoardAPI } from "../../../types/board";
import type { ChartData, ChartDocument, ValueConfidence } from "../../../types/charts";
import {
	addCategory,
	addSeries,
	changeKind,
	chartIssues,
	createHistory,
	formatValue,
	isEditedFromSource,
	pushHistory,
	redo,
	removeCategory,
	removeSeries,
	setValue,
	snapValue,
	undo,
	type History,
} from "./chartModel";
import { chartLayout, renderChartSvg } from "./chartRender";

type Draft = Pick<ChartDocument, "name" | "data" | "source" | "reveal" | "style">;
const draftOf = (c: ChartDocument): Draft =>
	structuredClone({
		name: c.name,
		data: c.data,
		source: c.source,
		reveal: c.reveal,
		style: c.style,
	});
const confidenceLabel: Record<ValueConfidence, string> = {
	printed: "Printed in source",
	estimated: "≈ Estimated from chart geometry",
	unreadable: "Unreadable · left empty",
	manual: "Entered or edited by you",
};
const PREVIEW = { w: 560, h: 340 };

/** Private editor: nothing here reaches the recording until Apply/Confirm saves it. */
export function ChartEditor({
	transport,
	chart,
	onClose,
	onPlace,
}: {
	transport: BoardAPI;
	chart: ChartDocument;
	onClose: () => void;
	onPlace: (chart: ChartDocument, shadow: boolean) => void;
}) {
	const [placeShadow, setPlaceShadow] = useState(true);
	const [history, setHistory] = useState<History<Draft>>(() => createHistory(draftOf(chart)));
	const [live, setLive] = useState<Draft>();
	const [base, setBase] = useState(chart.revision);
	const [saved, setSaved] = useState(() => draftOf(chart));
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState("");
	const [sourceImage, setSourceImage] = useState<string | null>(null);
	const [tab, setTab] = useState<"data" | "labels" | "source" | "reveal">("data");
	const [drag, setDrag] = useState<{ s: number; i: number; pointer: number } | null>(null);
	const svgBox = useRef<HTMLDivElement>(null);
	const draft = live ?? history.present;
	const data = draft.data;
	const dirty = JSON.stringify(history.present) !== JSON.stringify(saved);
	const issues = useMemo(() => chartIssues(data), [data]);
	const errors = issues.filter((i) => i.level === "error");
	const preview = useMemo(() => ({ ...chart, ...draft }), [chart, draft]);
	const layout = useMemo(() => chartLayout(preview, PREVIEW.w, PREVIEW.h), [preview]);
	const remoteChanged = chart.revision !== base;
	useEffect(() => {
		if (!chart.source.hasImage) return;
		void transport
			.request<{ dataURL: string | null }>("chartSource", chart.id)
			.then((r) => setSourceImage(r.dataURL))
			.catch(() => setSourceImage(null));
	}, [transport, chart.id, chart.source.hasImage]);
	const commit = (next: Draft) => {
		setLive(undefined);
		setHistory((h) => pushHistory(h, next));
	};
	const editData = (fn: (d: ChartData) => ChartData) =>
		commit({ ...draft, data: fn(draft.data) });
	async function save(status?: "reviewed" | "draft") {
		setBusy(true);
		setNotice("");
		try {
			const next = await transport.request<ChartDocument>("chartUpdate", {
				id: chart.id,
				baseRevision: base,
				name: draft.name.trim() || "Chart",
				data: draft.data,
				source: {
					url: draft.source.url,
					publisher: draft.source.publisher,
					published: draft.source.published,
					dateRange: draft.source.dateRange,
					notes: draft.source.notes,
				},
				reveal: draft.reveal,
				style: draft.style,
				...(status ? { status } : {}),
			});
			setBase(next.revision);
			setSaved(draftOf(next));
			setHistory(createHistory(draftOf(next)));
			setNotice(
				status === "reviewed" ? "Confirmed. You can place and show this chart." : "Saved.",
			);
			return next;
		} catch (e) {
			setNotice(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}
	const pointerValue = (clientX: number, clientY: number) => {
		const box = svgBox.current!.getBoundingClientRect();
		const scale = box.width / PREVIEW.w;
		const px = layout.horizontal ? (clientX - box.left) / scale : (clientY - box.top) / scale;
		return snapValue(layout.pxToValue(px), layout.tickStep, data);
	};
	const direct = data.kind === "line" || data.kind === "bar";
	return (
		<div className="chart-editor" onKeyDown={(e) => e.stopPropagation()}>
			<div className="chart-editor-top">
				<input
					aria-label="Chart name"
					value={draft.name}
					maxLength={80}
					onChange={(e) => setLive({ ...draft, name: e.target.value })}
					onBlur={() => live && commit(live)}
				/>
				<span className={`chart-status ${chart.status}`}>
					{chart.status === "reviewed" ? "Confirmed" : "Draft · private"}
				</span>
				{isEditedFromSource(preview) && (
					<span
						className="chart-status edited"
						title="Values, labels, units or scale differ from the extracted source. The original is kept."
					>
						Edited from source
					</span>
				)}
				<button
					aria-label="Undo"
					title="Undo"
					disabled={!history.past.length}
					onClick={() => setHistory(undo)}
				>
					<ArrowCounterClockwiseIcon size={16} />
				</button>
				<button
					aria-label="Redo"
					title="Redo"
					disabled={!history.future.length}
					onClick={() => setHistory(redo)}
				>
					<ArrowClockwiseIcon size={16} />
				</button>
			</div>
			{remoteChanged && (
				<p className="chart-warning" role="alert">
					This chart changed on another device.{" "}
					<button
						onClick={() => {
							setBase(chart.revision);
							setSaved(draftOf(chart));
							setHistory(createHistory(draftOf(chart)));
						}}
					>
						Load latest
					</button>
				</p>
			)}
			<div className="chart-compare">
				{sourceImage && (
					<figure>
						<img src={sourceImage} alt="Original screenshot" />
						<figcaption>Original</figcaption>
					</figure>
				)}
				<figure>
					<div
						ref={svgBox}
						className="chart-preview"
						style={{ aspectRatio: `${PREVIEW.w} / ${PREVIEW.h}` }}
						onPointerMove={(e) => {
							if (!drag || e.pointerId !== drag.pointer) return;
							setLive({
								...history.present,
								data: setValue(
									history.present.data,
									drag.s,
									drag.i,
									pointerValue(e.clientX, e.clientY),
								),
							});
						}}
						onPointerUp={() => {
							if (drag && live) commit(live);
							setDrag(null);
						}}
						onPointerCancel={() => {
							setLive(undefined);
							setDrag(null);
						}}
					>
						<div
							dangerouslySetInnerHTML={{
								__html: renderChartSvg(preview, {
									width: PREVIEW.w,
									height: PREVIEW.h,
									reveal: Number.POSITIVE_INFINITY,
									idPrefix: "editor",
								}),
							}}
						/>
						{direct &&
							layout.handles.map((row, s) =>
								row.map((h, i) =>
									h ? (
										<button
											key={`${s}:${i}`}
											className={`chart-handle ${drag?.s === s && drag.i === i ? "dragging" : ""}`}
											style={{
												left: `${(h.x / PREVIEW.w) * 100}%`,
												top: `${(h.y / PREVIEW.h) * 100}%`,
												borderColor: data.series[s].color,
											}}
											aria-label={`${data.series[s].name}, ${data.categories[i]}: ${formatValue(data.series[s].values[i], data)}. Drag or use arrow keys to change.`}
											title={formatValue(data.series[s].values[i], data)}
											onPointerDown={(e) => {
												e.preventDefault();
												e.currentTarget.parentElement?.setPointerCapture(
													e.pointerId,
												);
												setDrag({ s, i, pointer: e.pointerId });
											}}
											onKeyDown={(e) => {
												const delta = {
													ArrowUp: 1,
													ArrowRight: 1,
													ArrowDown: -1,
													ArrowLeft: -1,
												}[e.key];
												if (!delta) return;
												e.preventDefault();
												const step =
													layout.tickStep / (e.shiftKey ? 1 : 10);
												const current = data.series[s].values[i].value ?? 0;
												editData((d) =>
													setValue(
														d,
														s,
														i,
														snapValue(
															current + delta * step,
															layout.tickStep,
															d,
														),
													),
												);
											}}
										/>
									) : null,
								),
							)}
						{drag && (
							<output className="chart-drag-value">
								{data.series[drag.s].name} · {data.categories[drag.i]}:{" "}
								{formatValue(data.series[drag.s].values[drag.i], data)}
							</output>
						)}
					</div>
					<figcaption>
						{direct
							? "Preview · drag a point or bar end, or use the table"
							: data.kind === "pie"
								? "Preview · edit slices in the table"
								: "Preview"}
					</figcaption>
				</figure>
			</div>
			{issues.length > 0 && (
				<ul className="chart-issues">
					{issues.map((i) => (
						<li key={i.message} className={i.level}>
							{i.level === "error" ? "Fix: " : ""}
							{i.message}
						</li>
					))}
				</ul>
			)}
			{draft.source.warnings.length > 0 && (
				<details className="chart-ai-warnings">
					<summary>AI notes ({draft.source.warnings.length})</summary>
					<ul>
						{draft.source.warnings.map((w) => (
							<li key={w}>{w}</li>
						))}
					</ul>
				</details>
			)}
			<div className="chart-tabs" role="tablist">
				{(["data", "labels", "source", "reveal"] as const).map((t) => (
					<button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
						{
							{
								data: "Data",
								labels: "Type & labels",
								source: "Source",
								reveal: "Reveal & style",
							}[t]
						}
					</button>
				))}
			</div>
			{tab === "data" && (
				<div className="chart-table-wrap">
					<table className="chart-table">
						<thead>
							<tr>
								<th>
									{data.kind === "pie"
										? "Slice"
										: data.kind === "card"
											? "Label"
											: data.xType === "date"
												? "Date"
												: "Label"}
								</th>
								{data.series.map((s, j) => (
									<th key={s.id}>
										<span className="chart-series-head">
											<input
												type="color"
												aria-label={`Color for ${s.name}`}
												value={s.color}
												onChange={(e) =>
													editData((d) => ({
														...d,
														series: d.series.map((x, k) =>
															k === j
																? { ...x, color: e.target.value }
																: x,
														),
													}))
												}
											/>
											<input
												aria-label="Series name"
												value={s.name}
												maxLength={120}
												onChange={(e) =>
													editData((d) => ({
														...d,
														series: d.series.map((x, k) =>
															k === j
																? { ...x, name: e.target.value }
																: x,
														),
													}))
												}
											/>
											{data.series.length > 1 && (
												<button
													aria-label={`Remove series ${s.name}`}
													onClick={() =>
														editData((d) => removeSeries(d, j))
													}
												>
													<TrashIcon size={14} />
												</button>
											)}
										</span>
									</th>
								))}
								<th />
							</tr>
						</thead>
						<tbody>
							{data.categories.map((c, i) => (
								<tr key={i}>
									<td>
										<input
											aria-label={`Label ${i + 1}`}
											value={c}
											maxLength={120}
											onChange={(e) =>
												editData((d) => ({
													...d,
													categories: d.categories.map((x, k) =>
														k === i ? e.target.value : x,
													),
												}))
											}
										/>
									</td>
									{data.series.map((s, j) => {
										const v = s.values[i];
										return (
											<td
												key={s.id}
												className={`conf-${v.confidence}`}
												title={confidenceLabel[v.confidence]}
											>
												<NumberCell
													value={v.value}
													label={`${s.name}, ${c}`}
													onChange={(value) =>
														editData((d) => setValue(d, j, i, value))
													}
												/>
												{v.confidence === "estimated" && (
													<span className="chart-conf">≈</span>
												)}
												{v.value === null && (
													<span className="chart-conf">?</span>
												)}
											</td>
										);
									})}
									<td>
										{data.categories.length > 1 && (
											<button
												aria-label={`Remove ${c}`}
												onClick={() =>
													editData((d) => removeCategory(d, i))
												}
											>
												<TrashIcon size={14} />
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<div className="chart-row-actions">
						{data.kind !== "card" && (
							<button onClick={() => editData((d) => addCategory(d))}>
								<PlusIcon size={14} /> Row
							</button>
						)}
						{(data.kind === "line" || data.kind === "bar") && (
							<button onClick={() => editData(addSeries)}>
								<PlusIcon size={14} /> Series
							</button>
						)}
						<small>
							Empty cells are missing data, shown as gaps (never zero). ≈ marks values
							estimated from geometry; typing a value marks it as yours.
						</small>
					</div>
				</div>
			)}
			{tab === "labels" && (
				<div className="chart-fields">
					<label>
						Chart type
						<select
							value={data.kind}
							onChange={(e) =>
								editData((d) => changeKind(d, e.target.value as ChartData["kind"]))
							}
						>
							<option value="line">Line · change over time</option>
							<option value="bar">Bar · compare categories</option>
							<option value="pie">Pie / donut · parts of a whole</option>
							<option value="card">Statistic card · one number</option>
						</select>
					</label>
					{data.kind === "bar" && (
						<label>
							Bars
							<select
								value={data.orientation}
								onChange={(e) =>
									editData((d) => ({
										...d,
										orientation: e.target.value as ChartData["orientation"],
									}))
								}
							>
								<option value="vertical">Vertical</option>
								<option value="horizontal">
									Horizontal · best for long labels
								</option>
							</select>
						</label>
					)}
					{data.kind === "pie" && (
						<>
							<label className="check">
								<input
									type="checkbox"
									checked={data.donut}
									onChange={(e) =>
										editData((d) => ({ ...d, donut: e.target.checked }))
									}
								/>{" "}
								Donut
							</label>
							<label>
								The whole is
								<select
									value={data.pieTotal.mode}
									onChange={(e) =>
										editData((d) => ({
											...d,
											pieTotal: {
												...d.pieTotal,
												mode: e.target.value as "sum" | "fixed",
											},
										}))
									}
								>
									<option value="sum">The sum of these slices</option>
									<option value="fixed">A known total</option>
								</select>
								<small>
									Use a known total (e.g. 100%) when some parts are not listed.
									Percentages are never rescaled silently.
								</small>
							</label>
							{data.pieTotal.mode === "fixed" && (
								<label>
									Total
									<NumberCell
										value={data.pieTotal.value}
										label="Pie total"
										onChange={(value) =>
											editData((d) => ({
												...d,
												pieTotal: { ...d.pieTotal, value },
											}))
										}
									/>
								</label>
							)}
						</>
					)}
					<label>
						Title
						<input
							value={data.title}
							maxLength={160}
							onChange={(e) => editData((d) => ({ ...d, title: e.target.value }))}
						/>
					</label>
					<label>
						Subtitle / context
						<input
							value={data.subtitle}
							maxLength={240}
							placeholder="e.g. Seasonally adjusted, 2015–2024"
							onChange={(e) => editData((d) => ({ ...d, subtitle: e.target.value }))}
						/>
					</label>
					<div className="chart-inline">
						<label>
							Unit before
							<input
								value={data.unit.prefix}
								maxLength={12}
								placeholder="$"
								onChange={(e) =>
									editData((d) => ({
										...d,
										unit: { ...d.unit, prefix: e.target.value },
									}))
								}
							/>
						</label>
						<label>
							Unit after
							<input
								value={data.unit.suffix}
								maxLength={24}
								placeholder="%, bn, °C"
								onChange={(e) =>
									editData((d) => ({
										...d,
										unit: { ...d.unit, suffix: e.target.value },
									}))
								}
							/>
						</label>
						<label>
							Decimals
							<select
								value={data.decimals ?? "auto"}
								onChange={(e) =>
									editData((d) => ({
										...d,
										decimals:
											e.target.value === "auto"
												? null
												: Number(e.target.value),
									}))
								}
							>
								<option value="auto">Auto</option>
								{[0, 1, 2, 3].map((n) => (
									<option key={n} value={n}>
										{n}
									</option>
								))}
							</select>
						</label>
					</div>
					{(data.kind === "line" || data.kind === "bar") && (
						<>
							<label>
								Value axis title
								<input
									value={data.yAxis.label}
									maxLength={120}
									onChange={(e) =>
										editData((d) => ({
											...d,
											yAxis: { ...d.yAxis, label: e.target.value },
										}))
									}
								/>
							</label>
							<div className="chart-inline">
								<label>
									Scale
									<select
										value={data.yAxis.scale}
										onChange={(e) =>
											editData((d) => ({
												...d,
												yAxis: {
													...d.yAxis,
													scale: e.target.value as "linear" | "log",
												},
											}))
										}
									>
										<option value="linear">Linear</option>
										<option value="log">Logarithmic</option>
									</select>
								</label>
								<label>
									Axis min
									<NumberCell
										value={data.yAxis.min}
										label="Axis minimum (empty = automatic)"
										placeholder="auto"
										onChange={(value) =>
											editData((d) => ({
												...d,
												yAxis: { ...d.yAxis, min: value },
											}))
										}
									/>
								</label>
								<label>
									Axis max
									<NumberCell
										value={data.yAxis.max}
										label="Axis maximum (empty = automatic)"
										placeholder="auto"
										onChange={(value) =>
											editData((d) => ({
												...d,
												yAxis: { ...d.yAxis, max: value },
											}))
										}
									/>
								</label>
							</div>
							<small>
								Bars start at zero automatically. A different start or a log scale
								is disclosed on the chart.
							</small>
							<label>
								Scale note from source
								<input
									value={data.yAxis.sourceScaleNote}
									maxLength={200}
									placeholder="e.g. Source axis starts at 40"
									onChange={(e) =>
										editData((d) => ({
											...d,
											yAxis: { ...d.yAxis, sourceScaleNote: e.target.value },
										}))
									}
								/>
							</label>
						</>
					)}
					{data.kind === "line" && (
						<label className="check">
							<input
								type="checkbox"
								checked={data.xType === "date"}
								onChange={(e) =>
									editData((d) => ({
										...d,
										xType: e.target.checked ? "date" : "category",
									}))
								}
							/>{" "}
							Space labels as dates (2024, 2024-Q1, 2024-03, 2024-03-31)
						</label>
					)}
				</div>
			)}
			{tab === "source" && (
				<div className="chart-fields">
					<label>
						Source link
						<input
							value={draft.source.url}
							maxLength={2048}
							placeholder="https://…"
							inputMode="url"
							onChange={(e) =>
								commit({
									...draft,
									source: { ...draft.source, url: e.target.value },
								})
							}
						/>
					</label>
					<div className="chart-inline">
						<label>
							Publisher
							<input
								value={draft.source.publisher}
								maxLength={120}
								onChange={(e) =>
									commit({
										...draft,
										source: { ...draft.source, publisher: e.target.value },
									})
								}
							/>
						</label>
						<label>
							Published
							<input
								value={draft.source.published}
								maxLength={60}
								placeholder="2024-05-01"
								onChange={(e) =>
									commit({
										...draft,
										source: { ...draft.source, published: e.target.value },
									})
								}
							/>
						</label>
					</div>
					<label>
						Date range covered
						<input
							value={draft.source.dateRange}
							maxLength={120}
							onChange={(e) =>
								commit({
									...draft,
									source: { ...draft.source, dateRange: e.target.value },
								})
							}
						/>
					</label>
					<label>
						Private notes
						<textarea
							value={draft.source.notes}
							maxLength={1000}
							rows={2}
							onChange={(e) =>
								commit({
									...draft,
									source: { ...draft.source, notes: e.target.value },
								})
							}
						/>
					</label>
					<label className="check">
						<input
							type="checkbox"
							checked={draft.style.showSource}
							onChange={(e) =>
								commit({
									...draft,
									style: { ...draft.style, showSource: e.target.checked },
								})
							}
						/>{" "}
						Show source line on the chart
					</label>
					<small>
						{chart.source.method === "ai"
							? `Read by ${chart.source.model} from your screenshot. Check every value against the source.`
							: chart.source.method === "mcp"
								? "Prepared by an agent through MistaRecorda's local connection. Check every value."
								: "Entered manually."}
					</small>
				</div>
			)}
			{tab === "reveal" && (
				<div className="chart-fields">
					<label>
						Reveal
						<select
							value={draft.reveal.order}
							onChange={(e) =>
								commit({
									...draft,
									reveal: {
										...draft.reveal,
										order: e.target.value as "category" | "series",
									},
								})
							}
						>
							<option value="category">
								One {data.kind === "pie" ? "slice" : "label"} at a time
							</option>
							<option
								value="series"
								disabled={data.series.length < 2 || data.kind === "pie"}
							>
								One series at a time
							</option>
						</select>
					</label>
					<label>
						Seconds per step when playing
						<input
							type="number"
							min={0.15}
							max={20}
							step={0.05}
							value={draft.reveal.msPerStep / 1000}
							onChange={(e) =>
								commit({
									...draft,
									reveal: {
										...draft.reveal,
										msPerStep: Math.round(
											Math.max(
												0.15,
												Math.min(20, Number(e.target.value) || 1.2),
											) * 1000,
										),
									},
								})
							}
						/>
					</label>
					<label className="check">
						<input
							type="checkbox"
							checked={draft.reveal.animate}
							onChange={(e) =>
								commit({
									...draft,
									reveal: { ...draft.reveal, animate: e.target.checked },
								})
							}
						/>{" "}
						Animate between steps (off = each step appears at once)
					</label>
					<label>
						Look
						<select
							value={draft.style.theme}
							onChange={(e) =>
								commit({
									...draft,
									style: {
										...draft.style,
										theme: e.target.value as "light" | "dark" | "board",
									},
								})
							}
						>
							<option value="light">Light card · best over screens</option>
							<option value="dark">Dark card</option>
							<option value="board">No card · on the whiteboard</option>
						</select>
					</label>
					<label className="check">
						<input
							type="checkbox"
							checked={draft.style.showValues}
							onChange={(e) =>
								commit({
									...draft,
									style: { ...draft.style, showValues: e.target.checked },
								})
							}
						/>{" "}
						Show value labels
					</label>
					<label className="check">
						<input
							type="checkbox"
							checked={draft.style.legend}
							onChange={(e) =>
								commit({
									...draft,
									style: { ...draft.style, legend: e.target.checked },
								})
							}
						/>{" "}
						Legend for several series
					</label>
					<small>
						The title, axes and labels appear first. The reveal starts hidden and moves
						only when you press Play, Next or drag the slider.
					</small>
				</div>
			)}
			{notice && <output className="chart-notice">{notice}</output>}
			{chart.status === "reviewed" && (
				<label className="check chart-place-shadow">
					<input
						type="checkbox"
						checked={placeShadow}
						onChange={(e) => setPlaceShadow(e.target.checked)}
					/>{" "}
					Place as shadow · iPad only, until Show on screen
				</label>
			)}
			<footer className="chart-editor-actions">
				{chart.original && (
					<button
						disabled={busy || !isEditedFromSource(preview)}
						title="Restore the values as first extracted. Undo can bring your edits back."
						onClick={() => commit({ ...draft, data: structuredClone(chart.original!) })}
					>
						Reset to source
					</button>
				)}
				<button disabled={busy} onClick={onClose}>
					{dirty ? "Discard" : "Close"}
				</button>
				<button disabled={busy || !dirty} onClick={() => void save()}>
					{chart.status === "reviewed" ? "Apply" : "Save draft"}
				</button>
				{chart.status !== "reviewed" ? (
					<button
						className="primary"
						disabled={busy || errors.length > 0}
						title={
							errors[0]?.message ??
							"Confirm the data is correct so this chart can be shown."
						}
						onClick={() => void save("reviewed")}
					>
						Confirm data
					</button>
				) : (
					<button
						className="primary"
						disabled={busy || errors.length > 0}
						onClick={async () => {
							const next = dirty ? await save() : chart;
							if (next) onPlace(next, placeShadow);
						}}
					>
						{dirty ? "Apply & place" : "Place"}
					</button>
				)}
			</footer>
		</div>
	);
}

/** Text input so "-", "." and an empty (missing) value can be typed without fighting the field. */
export function NumberCell({
	value,
	label,
	placeholder = "n/a",
	onChange,
}: {
	value: number | null;
	label: string;
	placeholder?: string;
	onChange: (value: number | null) => void;
}) {
	const [text, setText] = useState(value === null ? "" : String(value));
	const focused = useRef(false);
	useEffect(() => {
		if (!focused.current) setText(value === null ? "" : String(value));
	}, [value]);
	const commitText = (t: string) => {
		const clean = t.replace(/[,\s]/g, "").replace(/^−/, "-");
		if (!clean) return onChange(null);
		const n = Number(clean);
		if (Number.isFinite(n) && Math.abs(n) <= 1e15) onChange(n);
	};
	return (
		<input
			className="chart-number"
			inputMode="decimal"
			aria-label={label}
			placeholder={placeholder}
			value={text}
			onFocus={() => {
				focused.current = true;
			}}
			onBlur={() => {
				focused.current = false;
				commitText(text);
				setText(value === null ? "" : String(value));
			}}
			onChange={(e) => setText(e.target.value)}
			onKeyDown={(e) => {
				if (e.key === "Enter") commitText(text);
			}}
		/>
	);
}
