import { z } from "zod";
import type { BoardElement } from "../../../types/board";
import type {
	ChartData,
	ChartDocument,
	ChartElementMeta,
	ChartKind,
	ChartSeries,
	ChartValue,
} from "../../../types/charts";

export const CHART_LIMITS = {
	charts: 40,
	categories: 120,
	series: 8,
	points: 1000,
	label: 120,
	sourceBytes: 6 * 1024 * 1024,
};
/** Okabe–Ito: distinguishable with common color-vision deficiencies. */
export const CHART_PALETTE = [
	"#0072B2",
	"#D55E00",
	"#009E73",
	"#CC79A7",
	"#E69F00",
	"#56B4E9",
	"#000000",
	"#8C6D31",
];
const label = z.string().trim().max(CHART_LIMITS.label);
const finite = z.number().finite().min(-1e15).max(1e15);
export const chartValueSchema = z.object({
	value: finite.nullable(),
	confidence: z.enum(["printed", "estimated", "unreadable", "manual"]),
});
export const chartSeriesSchema = z.object({
	id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
	name: label,
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
	values: z.array(chartValueSchema).max(CHART_LIMITS.categories),
});
export const chartDataSchema = z
	.object({
		kind: z.enum(["line", "bar", "pie", "card"]),
		title: z.string().trim().max(160),
		subtitle: z.string().trim().max(240),
		categories: z.array(label).min(1).max(CHART_LIMITS.categories),
		xType: z.enum(["category", "date"]),
		series: z.array(chartSeriesSchema).min(1).max(CHART_LIMITS.series),
		unit: z.object({ prefix: z.string().max(12), suffix: z.string().max(24) }),
		yAxis: z.object({
			label: z.string().trim().max(120),
			scale: z.enum(["linear", "log"]),
			min: finite.nullable(),
			max: finite.nullable(),
			sourceScaleNote: z.string().trim().max(200),
		}),
		orientation: z.enum(["vertical", "horizontal"]),
		donut: z.boolean(),
		pieTotal: z.object({
			mode: z.enum(["sum", "fixed"]),
			value: finite.nullable(),
		}),
		decimals: z.number().int().min(0).max(6).nullable(),
	})
	.superRefine((data, ctx) => {
		for (const s of data.series)
			if (s.values.length !== data.categories.length)
				ctx.addIssue({
					code: "custom",
					message: `Series “${s.name}” needs one value per label.`,
				});
		if (data.series.length * data.categories.length > CHART_LIMITS.points)
			ctx.addIssue({ code: "custom", message: "Charts are limited to 1,000 values." });
		if (new Set(data.series.map((s) => s.id)).size !== data.series.length)
			ctx.addIssue({ code: "custom", message: "Duplicate series ID." });
	});
const httpURL = z
	.string()
	.trim()
	.max(2048)
	.refine((v) => {
		if (!v) return true;
		try {
			const u = new URL(v);
			return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password;
		} catch {
			return false;
		}
	}, "Use an http or https source link without credentials.");
export const chartDocumentSchema = z.object({
	format: z.literal("mistarecorda-chart"),
	version: z.literal(1),
	id: z.string().uuid(),
	name: z.string().trim().min(1).max(80),
	revision: z.number().int().nonnegative(),
	status: z.enum(["draft", "reviewed"]),
	created: z.number().nonnegative(),
	updated: z.number().nonnegative(),
	data: chartDataSchema,
	original: chartDataSchema.nullable(),
	source: z.object({
		url: httpURL,
		publisher: z.string().trim().max(120),
		published: z.string().trim().max(60),
		dateRange: z.string().trim().max(120),
		notes: z.string().trim().max(1000),
		method: z.enum(["ai", "manual", "mcp"]),
		model: z.string().max(80),
		extractedAt: z.number().nonnegative(),
		hasImage: z.boolean(),
		warnings: z.array(z.string().max(300)).max(20),
	}),
	reveal: z.object({
		order: z.enum(["category", "series"]),
		msPerStep: z.number().int().min(150).max(20000),
		animate: z.boolean(),
	}),
	style: z.object({
		theme: z.enum(["light", "dark", "board"]),
		showSource: z.boolean(),
		showValues: z.boolean(),
		legend: z.boolean(),
	}),
});
export const chartImageSchema = z
	.string()
	.max(Math.ceil((CHART_LIMITS.sourceBytes * 4) / 3) + 40)
	.regex(
		/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/,
		"Use a PNG, JPEG or WebP image.",
	);

export function emptyChartData(kind: ChartKind = "bar"): ChartData {
	const categories = kind === "card" ? ["Statistic"] : ["A", "B", "C"];
	return {
		kind,
		title: "",
		subtitle: "",
		categories,
		xType: "category",
		series: [
			{
				id: "s1",
				name: "Series 1",
				color: CHART_PALETTE[0],
				values: categories.map(() => ({ value: null, confidence: "manual" })),
			},
		],
		unit: { prefix: "", suffix: "" },
		yAxis: { label: "", scale: "linear", min: null, max: null, sourceScaleNote: "" },
		orientation: "vertical",
		donut: false,
		pieTotal: { mode: "sum", value: null },
		decimals: null,
	};
}
export function newChartDocument(
	id: string,
	data: ChartData,
	method: ChartDocument["source"]["method"],
	now = Date.now(),
): ChartDocument {
	return {
		format: "mistarecorda-chart",
		version: 1,
		id,
		name: (data.title || "Chart").slice(0, 80),
		revision: 0,
		status: method === "manual" ? "reviewed" : "draft",
		created: now,
		updated: now,
		data,
		original: method === "manual" ? null : structuredClone(data),
		source: {
			url: "",
			publisher: "",
			published: "",
			dateRange: "",
			notes: "",
			method,
			model: "",
			extractedAt: method === "manual" ? 0 : now,
			hasImage: false,
			warnings: [],
		},
		reveal: { order: "category", msPerStep: 1200, animate: true },
		style: { theme: "light", showSource: true, showValues: true, legend: true },
	};
}

/** Parse ISO-like period labels so date axes keep real spacing. */
export function parseDateLabel(text: string): number | null {
	const t = text.trim();
	let m = /^(\d{4})$/.exec(t);
	if (m) return Date.UTC(Number(m[1]), 0, 1);
	m = /^(\d{4})[-/ ]?Q([1-4])$/i.exec(t);
	if (m) return Date.UTC(Number(m[1]), (Number(m[2]) - 1) * 3, 1);
	m = /^(\d{4})-(\d{1,2})$/.exec(t);
	if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12)
		return Date.UTC(Number(m[1]), Number(m[2]) - 1, 1);
	m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
	if (m) {
		const v = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
		const d = new Date(v);
		return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? v : null;
	}
	return null;
}

export interface ChartIssue {
	level: "error" | "warning";
	message: string;
}
const values = (data: ChartData) => data.series.flatMap((s) => s.values);
export function pieTotal(data: ChartData) {
	const sum = data.series[0].values.reduce((t, v) => t + (v.value ?? 0), 0);
	return data.pieTotal.mode === "fixed" ? (data.pieTotal.value ?? Number.NaN) : sum;
}
/** Statistical checks. Errors block confirming/showing a chart; warnings are disclosed. */
export function chartIssues(data: ChartData): ChartIssue[] {
	const issues: ChartIssue[] = [];
	const error = (message: string) => issues.push({ level: "error", message });
	const warn = (message: string) => issues.push({ level: "warning", message });
	const parsed = chartDataSchema.safeParse(data);
	if (!parsed.success)
		return parsed.error.issues.map((i) => ({ level: "error", message: i.message }));
	const all = values(data);
	const present = all.filter((v) => v.value !== null);
	if (!present.length) error("Enter at least one value.");
	if (data.categories.some((c) => !c.trim())) error("Every label needs text.");
	if (data.kind === "pie") {
		if (data.series.length !== 1)
			error("A pie or donut shows one series. Use a bar chart to compare several series.");
		if (data.series[0].values.some((v) => v.value === null))
			error("Pie slices cannot have missing values. Enter them or remove the slice.");
		if (data.series[0].values.some((v) => (v.value ?? 0) < 0))
			error("Pie slices cannot be negative. Use a bar chart for gains and losses.");
		if (data.pieTotal.mode === "fixed") {
			const sum = data.series[0].values.reduce((t, v) => t + (v.value ?? 0), 0);
			if (data.pieTotal.value === null || !(data.pieTotal.value > 0))
				error("Enter the whole (total) this pie represents.");
			else if (sum > data.pieTotal.value * (1 + 1e-9))
				error(
					`Slices add up to ${formatNumber(sum, data)}, more than the stated whole of ${formatNumber(data.pieTotal.value, data)}. Check the values or the total.`,
				);
			else if (sum < data.pieTotal.value * (1 - 1e-9))
				warn("The remaining part of the whole is shown as “Not shown”.");
		} else if (data.unit.suffix.trim() === "%") {
			const sum = data.series[0].values.reduce((t, v) => t + (v.value ?? 0), 0);
			if (Math.abs(sum - 100) > 0.6)
				warn(
					`Percentages add up to ${formatNumber(sum, data)}%, not 100%. Set a fixed whole of 100 if categories are missing.`,
				);
		} else warn("Slice percentages are shares of the shown total.");
	}
	if (data.kind === "card") {
		if (data.categories.length !== 1 || data.series.length !== 1)
			error("A statistic card shows one labeled number.");
		else if (data.series[0].values[0]?.value === null) error("Enter the statistic.");
	}
	if (data.yAxis.scale === "log") {
		if (data.kind === "pie" || data.kind === "card")
			error("Log scale applies to line and bar charts only.");
		if (present.some((v) => (v.value as number) <= 0))
			error("A log scale cannot show zero or negative values.");
		if (data.kind === "bar")
			warn("Bars on a log scale do not start at zero; it is disclosed on the chart.");
	}
	if (data.xType === "date" && data.categories.some((c) => parseDateLabel(c) === null))
		error("Date labels must look like 2024, 2024-Q1, 2024-03 or 2024-03-31.");
	if (data.xType === "date" && data.kind !== "line")
		error("Date spacing is available for line charts.");
	if (
		data.kind === "bar" &&
		data.yAxis.scale === "linear" &&
		data.yAxis.min !== null &&
		data.yAxis.min > 0
	)
		warn(
			`The bar axis starts at ${formatNumber(data.yAxis.min, data)}; this is disclosed on the chart.`,
		);
	if (data.yAxis.min !== null && data.yAxis.max !== null && data.yAxis.min >= data.yAxis.max)
		error("The axis minimum must be below the maximum.");
	const outside = present.filter(
		(v) =>
			(data.yAxis.min !== null && (v.value as number) < data.yAxis.min) ||
			(data.yAxis.max !== null && (v.value as number) > data.yAxis.max),
	);
	if (outside.length && data.kind !== "pie" && data.kind !== "card")
		error("Some values fall outside the axis range. Widen the range so no data is hidden.");
	if (all.some((v) => v.confidence === "estimated"))
		warn("Some values are estimated from the chart geometry and marked ≈.");
	if (all.some((v) => v.value === null) && data.kind !== "pie")
		warn("Missing values are shown as gaps, not zero.");
	if (data.series.some((s) => !s.name.trim()) && data.series.length > 1)
		error("Name every series so the legend is readable.");
	return issues;
}
export const blockingIssues = (data: ChartData) =>
	chartIssues(data).filter((i) => i.level === "error");

export function dataSignature(data: ChartData) {
	return JSON.stringify({
		kind: data.kind,
		categories: data.categories,
		series: data.series.map((s) => [s.name, s.values.map((v) => v.value)]),
		unit: data.unit,
		yAxis: [data.yAxis.scale, data.yAxis.min, data.yAxis.max],
		pieTotal: data.pieTotal,
	});
}
/** True once the presenter changed values, labels, units or scale relative to the extraction. */
export function isEditedFromSource(doc: Pick<ChartDocument, "data" | "original">) {
	return !!doc.original && dataSignature(doc.original) !== dataSignature(doc.data);
}
export function revealSteps(data: ChartData, order: ChartDocument["reveal"]["order"]) {
	if (data.kind === "card") return 1;
	if (data.kind === "pie") return data.categories.length;
	return order === "series" && data.series.length > 1
		? data.series.length
		: data.categories.length;
}

export function autoDecimals(data: ChartData) {
	if (data.decimals !== null) return data.decimals;
	let decimals = 0;
	for (const v of values(data))
		if (v.value !== null) {
			const text = String(Math.abs(v.value));
			const d = text.includes("e") ? 0 : (text.split(".")[1]?.length ?? 0);
			decimals = Math.max(decimals, Math.min(d, 3));
		}
	return decimals;
}
/** A fixed locale keeps the iPad, Mac overlay and recording identical. */
export function formatNumber(value: number, data: ChartData, compact = false) {
	const abs = Math.abs(value);
	if (compact && abs >= 1e4) {
		const [div, s] =
			abs >= 1e12
				? [1e12, "T"]
				: abs >= 1e9
					? [1e9, "B"]
					: abs >= 1e6
						? [1e6, "M"]
						: [1e3, "K"];
		return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value / div)}${s}`;
	}
	const decimals = autoDecimals(data);
	if (abs > 0 && abs < 10 ** -decimals)
		return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 }).format(value);
	return new Intl.NumberFormat("en-US", {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	}).format(value);
}
export function formatValue(v: ChartValue, data: ChartData, compact = false) {
	if (v.value === null) return "n/a";
	const sign = v.value < 0 ? "−" : "";
	const text = `${data.unit.prefix}${formatNumber(Math.abs(v.value), data, compact)}${data.unit.suffix}`;
	return `${v.confidence === "estimated" ? "≈" : ""}${sign}${text}`;
}

/** Snap a dragged value to a sensible increment derived from the axis tick spacing. */
export function snapValue(value: number, tickStep: number, data: ChartData) {
	const step = tickStep / 10;
	const decimals = Math.max(0, Math.min(6, Math.ceil(-Math.log10(step))));
	const snapped = Math.round(value / step) * step;
	const rounded = Number(snapped.toFixed(decimals));
	if (data.yAxis.scale === "log") return Math.max(rounded, step);
	return Object.is(rounded, -0) ? 0 : rounded;
}
export function setValue(
	data: ChartData,
	seriesIndex: number,
	categoryIndex: number,
	value: number | null,
): ChartData {
	return {
		...data,
		series: data.series.map((s, i) =>
			i === seriesIndex
				? {
						...s,
						values: s.values.map((v, j) =>
							j === categoryIndex
								? { value, confidence: value === null ? "unreadable" : "manual" }
								: v,
						),
					}
				: s,
		),
	};
}
export function addCategory(data: ChartData, at = data.categories.length): ChartData {
	return {
		...data,
		categories: [
			...data.categories.slice(0, at),
			`Label ${data.categories.length + 1}`,
			...data.categories.slice(at),
		],
		series: data.series.map((s) => ({
			...s,
			values: [
				...s.values.slice(0, at),
				{ value: null, confidence: "manual" as const },
				...s.values.slice(at),
			],
		})),
	};
}
export function removeCategory(data: ChartData, index: number): ChartData {
	if (data.categories.length <= 1) return data;
	return {
		...data,
		categories: data.categories.filter((_, i) => i !== index),
		series: data.series.map((s) => ({ ...s, values: s.values.filter((_, i) => i !== index) })),
	};
}
export function addSeries(data: ChartData): ChartData {
	if (data.series.length >= CHART_LIMITS.series) return data;
	let n = data.series.length + 1;
	while (data.series.some((s) => s.id === `s${n}`)) n++;
	const series: ChartSeries = {
		id: `s${n}`,
		name: `Series ${data.series.length + 1}`,
		color: CHART_PALETTE[data.series.length % CHART_PALETTE.length],
		values: data.categories.map(() => ({ value: null, confidence: "manual" })),
	};
	return { ...data, series: [...data.series, series] };
}
export function removeSeries(data: ChartData, index: number): ChartData {
	if (data.series.length <= 1) return data;
	return { ...data, series: data.series.filter((_, i) => i !== index) };
}
/** Changing type keeps every value; it never flattens series silently. */
export function changeKind(data: ChartData, kind: ChartKind): ChartData {
	const next: ChartData = { ...data, kind };
	if (kind !== "line") next.xType = "category";
	if (kind === "pie" || kind === "card") next.yAxis = { ...next.yAxis, scale: "linear" };
	return next;
}

export interface History<T> {
	past: T[];
	present: T;
	future: T[];
}
export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });
export function pushHistory<T>(h: History<T>, next: T, limit = 100): History<T> {
	if (JSON.stringify(next) === JSON.stringify(h.present)) return h;
	return { past: [...h.past, h.present].slice(-limit), present: next, future: [] };
}
export function undo<T>(h: History<T>): History<T> {
	if (!h.past.length) return h;
	return {
		past: h.past.slice(0, -1),
		present: h.past[h.past.length - 1],
		future: [h.present, ...h.future],
	};
}
export function redo<T>(h: History<T>): History<T> {
	if (!h.future.length) return h;
	return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}

export function chartMeta(element: BoardElement): ChartElementMeta | undefined {
	const meta = (element?.customData as { chart?: ChartElementMeta } | undefined)?.chart;
	return meta && typeof meta.chartId === "string" ? meta : undefined;
}
/** The selectable carrier: an invisible filled rectangle (alpha 1/255) so its whole area hit-tests. */
export function chartElementProps(chartId: string) {
	return {
		type: "rectangle" as const,
		strokeColor: "transparent",
		backgroundColor: "#ffffff01",
		fillStyle: "solid" as const,
		strokeWidth: 1,
		roughness: 0,
		roundness: null,
		customData: { chart: { chartId } satisfies ChartElementMeta },
	};
}
const CARRIER_STYLE = {
	strokeColor: "transparent",
	backgroundColor: "#ffffff01",
	fillStyle: "solid",
	strokeWidth: 1,
	roughness: 0,
} as const;
/** Style controls must never turn the invisible carrier into a box covering the chart. */
export function carrierNeedsReset(e: BoardElement) {
	return !!chartMeta(e) && Object.entries(CARRIER_STYLE).some(([k, v]) => e[k] !== v);
}
export function normalizeChartCarrier(e: BoardElement): BoardElement {
	return carrierNeedsReset(e) ? { ...e, ...CARRIER_STYLE } : e;
}
export function defaultChartSize(data: ChartData, width: number) {
	const w = Math.max(240, Math.min(width, 4000));
	return { width: w, height: Math.round(w * (data.kind === "card" ? 0.5 : 0.62)) };
}
