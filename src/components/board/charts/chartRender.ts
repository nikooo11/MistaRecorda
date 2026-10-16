import type { ChartData, ChartDocument, ChartValue } from "../../../types/charts";
import {
	CHART_PALETTE,
	formatNumber,
	formatValue,
	isEditedFromSource,
	parseDateLabel,
	pieTotal,
	revealSteps,
} from "./chartModel";

/** One deterministic renderer shared by the iPad, Mac overlay/recording, editor and thumbnails. */
export type RenderableChart = Pick<
	ChartDocument,
	"data" | "original" | "source" | "style" | "reveal"
>;
export interface RenderOptions {
	width: number;
	height: number;
	/** 0…revealSteps; Infinity shows everything. */
	reveal: number;
	idPrefix: string;
}
interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}
export interface ChartLayout {
	width: number;
	height: number;
	font: number;
	plot: Rect;
	horizontal: boolean;
	ticks: number[];
	tickStep: number;
	domain: [number, number];
	baseline: number;
	/** Pixel along the value axis (y for vertical, x for horizontal). */
	valueToPx: (v: number) => number;
	pxToValue: (px: number) => number;
	/** Category centre along the category axis, plus band width for bars. */
	categoryPx: (i: number) => number;
	band: number;
	/** Centre of each mark (point or bar end) for direct manipulation. */
	handles: Array<Array<{ x: number; y: number } | null>>;
	theme: { bg: string; text: string; muted: string; grid: string; border: string };
	title: string[];
	footer: string[];
}

const esc = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
	);
const n = (v: number) => (Number.isFinite(v) ? Number(v.toFixed(2)) : 0);
export function textWidth(text: string, size: number) {
	let w = 0;
	for (const ch of text)
		w += /[MW@%]/.test(ch)
			? 0.85
			: /[A-Z0-9#$€£]/.test(ch)
				? 0.64
				: /[ il.,:;'|!]/.test(ch)
					? 0.3
					: ch.charCodeAt(0) > 0x2e80
						? 1
						: 0.53;
	return w * size;
}
export function fitText(text: string, maxWidth: number, size: number) {
	if (textWidth(text, size) <= maxWidth) return text;
	const chars = [...text];
	while (chars.length > 1 && textWidth(`${chars.join("")}…`, size) > maxWidth) chars.pop();
	return chars.length > 1 ? `${chars.join("").trimEnd()}…` : "";
}
function niceStep(raw: number) {
	if (!(raw > 0) || !Number.isFinite(raw)) return 1;
	const p = 10 ** Math.floor(Math.log10(raw));
	const f = raw / p;
	return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
const themes = {
	light: { bg: "#ffffff", text: "#1d2733", muted: "#566373", grid: "#e2e6eb", border: "#c9d0d8" },
	dark: { bg: "#1c2027", text: "#f4f6f8", muted: "#b6bec8", grid: "#3a414b", border: "#4a525e" },
	board: { bg: "none", text: "#1d2733", muted: "#4f5b69", grid: "#d4d9df", border: "none" },
};
function seriesColor(color: string, theme: keyof typeof themes) {
	if (theme !== "dark") return color;
	const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16) / 255);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.18 ? "#e8eaed" : color;
}
const present = (data: ChartData) =>
	data.series.flatMap((s) => s.values.map((v) => v.value)).filter((v): v is number => v !== null);

function valueDomain(data: ChartData) {
	const values = present(data);
	const log = data.yAxis.scale === "log";
	let lo = Math.min(...values),
		hi = Math.max(...values);
	if (!values.length) [lo, hi] = [0, 1];
	if (log) {
		const plo = Math.max(1e-12, Math.min(...values.filter((v) => v > 0), 1));
		const a =
			data.yAxis.min && data.yAxis.min > 0
				? data.yAxis.min
				: 10 ** Math.floor(Math.log10(plo));
		const b =
			data.yAxis.max && data.yAxis.max > a
				? data.yAxis.max
				: 10 ** Math.ceil(Math.log10(Math.max(hi, a * 10)));
		const ticks: number[] = [];
		for (let e = Math.floor(Math.log10(a)); 10 ** e <= b * 1.0001; e++)
			if (10 ** e >= a * 0.9999) ticks.push(10 ** e);
		if (ticks.length < 3)
			for (let e = Math.floor(Math.log10(a)); 10 ** e <= b; e++)
				for (const m of [2, 5])
					if (m * 10 ** e > a && m * 10 ** e < b) ticks.push(m * 10 ** e);
		ticks.sort((x, y) => x - y);
		return { lo: a, hi: b, ticks, step: ticks[1] ? ticks[1] - ticks[0] : a };
	}
	if (data.kind === "bar") {
		lo = Math.min(lo, 0);
		hi = Math.max(hi, 0);
	}
	if (data.yAxis.min !== null) lo = data.yAxis.min;
	if (data.yAxis.max !== null) hi = data.yAxis.max;
	if (lo === hi) {
		const pad = Math.abs(lo) * 0.1 || 1;
		lo -= data.kind === "bar" && lo === 0 ? 0 : pad;
		hi += pad;
	}
	const step = niceStep((hi - lo) / 5);
	if (data.yAxis.min === null) lo = Math.floor(lo / step + 1e-9) * step;
	if (data.yAxis.max === null) hi = Math.ceil(hi / step - 1e-9) * step;
	const ticks: number[] = [];
	for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-6; t += step)
		ticks.push(Number(t.toPrecision(12)));
	return { lo, hi, ticks, step };
}

export function chartFooter(chart: RenderableChart): string[] {
	const { data, source, style } = chart;
	const notes: string[] = [];
	const all = data.series.flatMap((s) => s.values);
	if (all.some((v) => v.confidence === "estimated"))
		notes.push("≈ estimated from chart geometry");
	if (data.kind !== "pie" && all.some((v) => v.value === null))
		notes.push("gaps / n/a = missing data");
	if (isEditedFromSource(chart)) notes.push("Edited from source");
	if (data.kind !== "pie" && data.kind !== "card") {
		if (data.yAxis.scale === "log") notes.push("Log scale");
		else if (data.kind === "bar" && data.yAxis.min !== null && data.yAxis.min > 0)
			notes.push(
				`Axis starts at ${data.unit.prefix}${formatNumber(data.yAxis.min, data)}${data.unit.suffix}`,
			);
	}
	if (data.kind === "pie")
		notes.push(
			data.pieTotal.mode === "fixed"
				? `Whole = ${data.unit.prefix}${formatNumber(data.pieTotal.value ?? 0, data)}${data.unit.suffix}`
				: data.unit.suffix.trim() === "%"
					? "Shares as published"
					: "Shares of shown total",
		);
	if (data.yAxis.sourceScaleNote) notes.push(data.yAxis.sourceScaleNote);
	const lines = [notes.join(" · ")].filter(Boolean);
	if (style.showSource) {
		let host = "";
		try {
			host = source.url ? new URL(source.url).hostname.replace(/^www\./, "") : "";
		} catch {
			/* Validated on save; ignore legacy text. */
		}
		const who = source.publisher || host;
		const when = [source.published, source.dateRange && `(${source.dateRange})`]
			.filter(Boolean)
			.join(" ");
		if (who || when) lines.push(`Source: ${[who, when].filter(Boolean).join(", ")}`);
		else lines.push("Source: not specified");
	}
	return lines;
}

export function chartLayout(chart: RenderableChart, width: number, height: number): ChartLayout {
	const { data, style } = chart;
	const theme = themes[style.theme];
	const s = Math.max(60, Math.min(width, height * 1.6));
	const font = Math.max(9, Math.min(34, s * 0.032));
	const pad = Math.max(8, font * 0.9);
	let y = pad;
	const title: string[] = [];
	if (data.title) {
		title.push(fitText(data.title, width - pad * 2, font * 1.35));
		y += font * 1.6;
	}
	if (data.subtitle) {
		title.push(fitText(data.subtitle, width - pad * 2, font * 0.95));
		y += font * 1.25;
	}
	const legend =
		style.legend && data.series.length > 1 && (data.kind === "line" || data.kind === "bar");
	if (legend) y += font * 1.5;
	const footer = chartFooter(chart).map((l) => fitText(l, width - pad * 2, font * 0.75));
	const bottom = height - pad - footer.length * font * 1.05;
	const horizontal = data.kind === "bar" && data.orientation === "horizontal";
	const dom = valueDomain(data);
	const log = data.yAxis.scale === "log";
	const tickLabels = dom.ticks.map((t) => tickLabel(t, dom.step, data));
	const tickW = Math.max(...tickLabels.map((t) => textWidth(t, font * 0.85)), font);
	const axisLabel = data.yAxis.label ? font * 1.3 : 0;
	let plot: Rect;
	if (data.kind === "pie" || data.kind === "card")
		plot = {
			x: pad,
			y: y + font * 0.3,
			w: width - pad * 2,
			h: Math.max(10, bottom - y - font * 0.6),
		};
	else if (horizontal) {
		const catW = Math.min(
			width * 0.34,
			Math.max(...data.categories.map((c) => textWidth(c, font * 0.85))) + font * 0.6,
		);
		plot = {
			x: pad + catW,
			y: y + font * 0.5,
			w: Math.max(10, width - pad * 2 - catW - tickW * 0.5),
			h: Math.max(10, bottom - y - font * 2.6 - axisLabel),
		};
	} else
		plot = {
			x: pad + axisLabel + tickW + font * 0.5,
			y: y + font * 0.6,
			w: Math.max(10, width - pad * 2 - axisLabel - tickW - font * 0.9),
			h: Math.max(10, bottom - y - font * 2.4),
		};
	const span = horizontal ? plot.w : plot.h;
	const f = (v: number) =>
		log
			? (Math.log10(Math.max(v, 1e-300)) - Math.log10(dom.lo)) /
				(Math.log10(dom.hi) - Math.log10(dom.lo))
			: (v - dom.lo) / (dom.hi - dom.lo);
	const valueToPx = (v: number) =>
		horizontal ? plot.x + f(v) * span : plot.y + plot.h - f(v) * span;
	const pxToValue = (px: number) => {
		const t = horizontal ? (px - plot.x) / span : (plot.y + plot.h - px) / span;
		return log
			? 10 ** (Math.log10(dom.lo) + t * (Math.log10(dom.hi) - Math.log10(dom.lo)))
			: dom.lo + t * (dom.hi - dom.lo);
	};
	const count = data.categories.length;
	const catSpan = horizontal ? plot.h : plot.w;
	const catStart = horizontal ? plot.y : plot.x;
	const band = catSpan / count;
	let categoryPx = (i: number) => catStart + band * (i + 0.5);
	if (data.kind === "line") {
		const times = data.xType === "date" ? data.categories.map(parseDateLabel) : [];
		if (times.length && times.every((t) => t !== null)) {
			const a = Math.min(...(times as number[])),
				b = Math.max(...(times as number[]));
			categoryPx = (i: number) =>
				b === a
					? plot.x + plot.w / 2
					: plot.x +
						font * 0.6 +
						(((times[i] as number) - a) / (b - a)) * (plot.w - font * 1.2);
		} else if (count > 1)
			categoryPx = (i: number) =>
				plot.x + font * 0.6 + (i / (count - 1)) * (plot.w - font * 1.2);
		else categoryPx = () => plot.x + plot.w / 2;
	}
	const baseline = log ? dom.lo : Math.max(dom.lo, Math.min(dom.hi, 0));
	const groups = data.series.length;
	const inner = band * 0.78;
	const handles = data.series.map((series, j) =>
		series.values.map((v, i) => {
			if (v.value === null || data.kind === "pie" || data.kind === "card") return null;
			const along =
				data.kind === "bar"
					? categoryPx(i) - inner / 2 + (inner / groups) * (j + 0.5)
					: categoryPx(i);
			const at = valueToPx(v.value);
			return horizontal ? { x: at, y: along } : { x: along, y: at };
		}),
	);
	return {
		width,
		height,
		font,
		plot,
		horizontal,
		ticks: dom.ticks,
		tickStep: dom.step,
		domain: [dom.lo, dom.hi],
		baseline,
		valueToPx,
		pxToValue,
		categoryPx,
		band,
		handles,
		theme,
		title,
		footer,
	};
}

/** Tick labels use the decimals their spacing needs (0%, 2%, … not 0.0%). */
function tickLabel(t: number, step: number, data: ChartData) {
	const decimals =
		step >= 1 || !(step > 0) ? 0 : Math.min(6, Math.ceil(-Math.log10(step) - 1e-9));
	const v = Math.abs(t) < step * 1e-9 ? 0 : t;
	const text = formatNumber(Math.abs(v), { ...data, decimals }, true);
	return `${v < 0 ? "−" : ""}${data.unit.prefix}${text}${data.unit.suffix}`;
}
const markerPath = (k: number, x: number, y: number, r: number) => {
	switch (k % 5) {
		case 0:
			return `M${n(x - r)},${n(y)}a${n(r)},${n(r)} 0 1,0 ${n(r * 2)},0a${n(r)},${n(r)} 0 1,0 ${n(-r * 2)},0Z`;
		case 1:
			return `M${n(x - r)},${n(y - r)}h${n(r * 2)}v${n(r * 2)}h${n(-r * 2)}Z`;
		case 2:
			return `M${n(x)},${n(y - r * 1.15)}L${n(x + r * 1.1)},${n(y + r * 0.85)}L${n(x - r * 1.1)},${n(y + r * 0.85)}Z`;
		case 3:
			return `M${n(x)},${n(y - r * 1.2)}L${n(x + r * 1.2)},${n(y)}L${n(x)},${n(y + r * 1.2)}L${n(x - r * 1.2)},${n(y)}Z`;
		default:
			return `M${n(x)},${n(y + r * 1.15)}L${n(x + r * 1.1)},${n(y - r * 0.85)}L${n(x - r * 1.1)},${n(y - r * 0.85)}Z`;
	}
};
const DASHES = ["", "7 4", "2 3", "9 3 2 3", "4 2"];
function patterns(prefix: string, size: number) {
	const s = n(Math.max(4, size));
	const stroke = `stroke="#ffffff" stroke-opacity="0.6" stroke-width="${n(s / 5)}"`;
	return [
		"",
		`<pattern id="${prefix}-p1" width="${s}" height="${s}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${s}" ${stroke}/></pattern>`,
		`<pattern id="${prefix}-p2" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><circle cx="${n(s / 2)}" cy="${n(s / 2)}" r="${n(s / 6)}" fill="#ffffff" fill-opacity="0.6"/></pattern>`,
		`<pattern id="${prefix}-p3" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><path d="M0,0L${s},${s}M${s},0L0,${s}" ${stroke}/></pattern>`,
		`<pattern id="${prefix}-p4" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><line x1="0" y1="${n(s / 2)}" x2="${s}" y2="${n(s / 2)}" ${stroke}/></pattern>`,
	];
}
const patternFill = (prefix: string, k: number) => (k % 5 === 0 ? "" : `url(#${prefix}-p${k % 5})`);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function renderChartSvg(chart: RenderableChart, opts: RenderOptions): string {
	const { data, style } = chart;
	const { width, height } = opts;
	const L = chartLayout(chart, width, height);
	const prefix = opts.idPrefix.replace(/[^A-Za-z0-9_-]/g, "");
	const t = L.theme;
	const font = L.font;
	const steps = revealSteps(data, chart.reveal.order);
	const p = Math.max(0, Math.min(steps, opts.reveal));
	const out: string[] = [];
	const text = (x: number, y: number, value: string, size: number, attrs = "", full?: string) =>
		`<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" ${attrs}>${full && full !== value ? `<title>${esc(full)}</title>` : ""}${esc(value)}</text>`;
	out.push(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" width="${n(width)}" height="${n(height)}" font-family="Helvetica, Arial, sans-serif" role="img" aria-label="${esc(data.title || "Chart")}">`,
	);
	out.push(
		`<defs>${patterns(prefix, font * 0.55).join("")}<clipPath id="${prefix}-clip"><rect x="${n(L.plot.x - font * 0.5)}" y="${n(L.plot.y - font * 0.5)}" width="${n(L.plot.w + font)}" height="${n(L.plot.h + font)}"/></clipPath></defs>`,
	);
	if (t.bg !== "none")
		out.push(
			`<rect x="0.5" y="0.5" width="${n(width - 1)}" height="${n(height - 1)}" rx="${n(font * 0.5)}" fill="${t.bg}" stroke="${t.border}"/>`,
		);
	let y = Math.max(8, font * 0.9);
	if (data.title) {
		out.push(
			text(
				Math.max(8, font * 0.9),
				y + font * 1.2,
				L.title[0],
				font * 1.35,
				`font-weight="700" fill="${t.text}"`,
				data.title,
			),
		);
		y += font * 1.6;
	}
	if (data.subtitle) {
		out.push(
			text(
				Math.max(8, font * 0.9),
				y + font * 0.85,
				L.title[data.title ? 1 : 0],
				font * 0.95,
				`fill="${t.muted}"`,
				data.subtitle,
			),
		);
		y += font * 1.25;
	}
	const legend =
		style.legend && data.series.length > 1 && (data.kind === "line" || data.kind === "bar");
	if (legend) {
		let x = Math.max(8, font * 0.9);
		data.series.forEach((s, j) => {
			const c = seriesColor(s.color, style.theme);
			const name = fitText(s.name, width * 0.3, font * 0.85);
			if (data.kind === "line")
				out.push(
					`<line x1="${n(x)}" y1="${n(y + font * 0.6)}" x2="${n(x + font * 1.6)}" y2="${n(y + font * 0.6)}" stroke="${c}" stroke-width="${n(font * 0.16)}" stroke-dasharray="${DASHES[j % 5]}"/><path d="${markerPath(j, x + font * 0.8, y + font * 0.6, font * 0.28)}" fill="${c}"/>`,
				);
			else
				out.push(
					`<rect x="${n(x)}" y="${n(y + font * 0.1)}" width="${n(font * 1.1)}" height="${n(font)}" fill="${c}"/>${j % 5 ? `<rect x="${n(x)}" y="${n(y + font * 0.1)}" width="${n(font * 1.1)}" height="${n(font)}" fill="${patternFill(prefix, j)}"/>` : ""}`,
				);
			out.push(
				text(
					x + font * 1.9,
					y + font * 0.92,
					name,
					font * 0.85,
					`fill="${t.text}"`,
					s.name,
				),
			);
			x += font * 2.4 + textWidth(name, font * 0.85) + font;
		});
	}
	const P = L.plot;
	if (data.kind === "line" || data.kind === "bar") {
		// Axes, ticks and labels are visible before data and stay fixed while revealing.
		for (const tick of L.ticks) {
			const at = L.valueToPx(tick);
			const label = tickLabel(tick, L.tickStep, data);
			if (L.horizontal) {
				out.push(
					`<line x1="${n(at)}" y1="${n(P.y)}" x2="${n(at)}" y2="${n(P.y + P.h)}" stroke="${t.grid}"/>`,
				);
				out.push(
					text(
						at,
						P.y + P.h + font * 1.15,
						label,
						font * 0.8,
						`fill="${t.muted}" text-anchor="middle"`,
					),
				);
			} else {
				out.push(
					`<line x1="${n(P.x)}" y1="${n(at)}" x2="${n(P.x + P.w)}" y2="${n(at)}" stroke="${t.grid}"/>`,
				);
				out.push(
					text(
						P.x - font * 0.4,
						at + font * 0.3,
						label,
						font * 0.8,
						`fill="${t.muted}" text-anchor="end"`,
					),
				);
			}
		}
		const zero = L.valueToPx(L.baseline);
		out.push(
			L.horizontal
				? `<line x1="${n(zero)}" y1="${n(P.y)}" x2="${n(zero)}" y2="${n(P.y + P.h)}" stroke="${t.text}" stroke-width="${n(Math.max(1, font * 0.08))}"/>`
				: `<line x1="${n(P.x)}" y1="${n(zero)}" x2="${n(P.x + P.w)}" y2="${n(zero)}" stroke="${t.text}" stroke-width="${n(Math.max(1, font * 0.08))}"/>`,
		);
		if (
			data.kind === "bar" &&
			data.yAxis.scale === "linear" &&
			data.yAxis.min !== null &&
			data.yAxis.min > 0
		) {
			// Broken-axis marker: a truncated bar axis is visibly disclosed.
			const a = zero,
				b = L.horizontal ? P.y + P.h : P.x;
			out.push(
				L.horizontal
					? `<path d="M${n(a - font * 0.3)},${n(b + font * 0.1)}l${n(font * 0.3)},${n(-font * 0.5)}l${n(font * 0.3)},${n(font * 0.5)}" fill="none" stroke="${t.text}"/>`
					: `<path d="M${n(b - font * 0.1)},${n(a + font * 0.3)}l${n(font * 0.5)},${n(-font * 0.3)}l${n(-font * 0.5)},${n(-font * 0.3)}" fill="none" stroke="${t.text}"/>`,
			);
		}
		if (data.yAxis.label) {
			if (L.horizontal)
				out.push(
					text(
						P.x + P.w / 2,
						P.y + P.h + font * 2.3,
						fitText(data.yAxis.label, P.w, font * 0.85),
						font * 0.85,
						`fill="${t.muted}" text-anchor="middle"`,
						data.yAxis.label,
					),
				);
			else {
				const ax = Math.max(8, font * 0.9) + font * 0.8,
					ay = P.y + P.h / 2;
				out.push(
					`<text x="${n(ax)}" y="${n(ay)}" font-size="${n(font * 0.85)}" fill="${t.muted}" text-anchor="middle" transform="rotate(-90 ${n(ax)} ${n(ay)})">${esc(fitText(data.yAxis.label, P.h, font * 0.85))}</text>`,
				);
			}
		}
		// Category labels: thin out evenly when crowded instead of overlapping.
		const size = font * 0.82;
		if (L.horizontal) {
			const every = Math.max(1, Math.ceil((size * 1.2) / L.band));
			data.categories.forEach((c, i) => {
				if (i % every) return;
				out.push(
					text(
						P.x - font * 0.4,
						L.categoryPx(i) + size * 0.35,
						fitText(c, P.x - font, size),
						size,
						`fill="${t.text}" text-anchor="end"`,
						c,
					),
				);
			});
		} else {
			const widest = Math.max(...data.categories.map((c) => textWidth(c, size)));
			const spacing =
				data.categories.length > 1 ? Math.abs(L.categoryPx(1) - L.categoryPx(0)) : P.w;
			const every = Math.max(
				1,
				Math.ceil(Math.min(widest + size, size * 9) / Math.max(1, spacing)),
			);
			data.categories.forEach((c, i) => {
				if (i % every) return;
				out.push(
					text(
						L.categoryPx(i),
						P.y + P.h + font * 1.15,
						fitText(c, spacing * every - size * 0.4, size),
						size,
						`fill="${t.text}" text-anchor="middle"`,
						c,
					),
				);
			});
		}
	}
	const labelFor = (v: ChartValue) => formatValue(v, data, true);
	const marks: string[] = [];
	const labels: string[] = [];
	if (data.kind === "line") {
		const many = data.categories.length > 14;
		data.series.forEach((s, j) => {
			const c = seriesColor(s.color, style.theme);
			const r =
				chart.reveal.order === "series" && data.series.length > 1
					? clamp01(p - j) * data.categories.length
					: p;
			const pts = s.values.map((v, i) =>
				v.value === null ? null : { x: L.categoryPx(i), y: L.valueToPx(v.value), v, i },
			);
			let d = "";
			let lastShown = -1;
			for (let i = 0; i < pts.length; i++) {
				const q = pts[i];
				const fi = clamp01(r - i);
				if (!q || fi <= 0) continue;
				const prev = i > 0 ? pts[i - 1] : null;
				if (prev && clamp01(r - (i - 1)) >= 1) {
					const x = prev.x + (q.x - prev.x) * fi,
						yy = prev.y + (q.y - prev.y) * fi;
					d += `${d.endsWith(`${n(prev.x)},${n(prev.y)}`) ? "" : `M${n(prev.x)},${n(prev.y)}`}L${n(x)},${n(yy)}`;
				} else if (fi >= 1) d += `M${n(q.x)},${n(q.y)}`;
				if (fi >= 1) lastShown = i;
			}
			if (d)
				marks.push(
					`<path d="${d}" fill="none" stroke="${c}" stroke-width="${n(font * 0.16)}" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="${DASHES[j % 5]}" clip-path="url(#${prefix}-clip)"/>`,
				);
			pts.forEach((q, i) => {
				if (!q || clamp01(r - i) < 1) return;
				const est = q.v.confidence === "estimated";
				marks.push(
					`<path d="${markerPath(j, q.x, q.y, font * (many ? 0.18 : 0.26))}" fill="${est ? (L.theme.bg === "none" ? "#ffffff" : L.theme.bg) : c}" stroke="${c}" stroke-width="${n(font * 0.08)}"/>`,
				);
				if (style.showValues && (!many || i === lastShown))
					labels.push(
						text(
							q.x,
							q.y - font * 0.55,
							labelFor(q.v),
							font * 0.78,
							`fill="${t.text}" text-anchor="middle" font-weight="600" paint-order="stroke" stroke="${L.theme.bg === "none" ? "#ffffff" : L.theme.bg}" stroke-width="${n(font * 0.25)}"`,
						),
					);
			});
			// Missing data is disclosed where the gap is, once revealed.
			s.values.forEach((v, i) => {
				if (v.value === null && clamp01(r - i) >= 1)
					labels.push(
						text(
							L.categoryPx(i),
							P.y + P.h - font * 0.35,
							"n/a",
							font * 0.7,
							`fill="${t.muted}" text-anchor="middle"`,
						),
					);
			});
		});
	} else if (data.kind === "bar") {
		const groups = data.series.length;
		const inner = L.band * 0.78;
		const thick = (inner / groups) * 0.9;
		const zero = L.valueToPx(L.baseline);
		data.series.forEach((s, j) => {
			const c = seriesColor(s.color, style.theme);
			const r =
				chart.reveal.order === "series" && groups > 1
					? clamp01(p - j) * data.categories.length
					: p;
			s.values.forEach((v, i) => {
				const fi = clamp01(r - i);
				if (fi <= 0) return;
				const along = L.categoryPx(i) - inner / 2 + (inner / groups) * (j + 0.5);
				if (v.value === null) {
					if (fi >= 1)
						labels.push(
							L.horizontal
								? text(
										zero + font * 0.3,
										along + font * 0.3,
										"n/a",
										font * 0.72,
										`fill="${t.muted}"`,
									)
								: text(
										along,
										zero - font * 0.4,
										"n/a",
										font * 0.72,
										`fill="${t.muted}" text-anchor="middle"`,
									),
						);
					return;
				}
				const end = zero + (L.valueToPx(v.value) - zero) * fi;
				const est = v.confidence === "estimated";
				const rect = L.horizontal
					? {
							x: Math.min(zero, end),
							y: along - thick / 2,
							w: Math.abs(end - zero),
							h: thick,
						}
					: {
							x: along - thick / 2,
							y: Math.min(zero, end),
							w: thick,
							h: Math.abs(end - zero),
						};
				const box = `x="${n(rect.x)}" y="${n(rect.y)}" width="${n(rect.w)}" height="${n(rect.h)}"`;
				marks.push(
					`<rect ${box} fill="${c}" fill-opacity="${est ? 0.55 : 1}"${est ? ` stroke="${c}" stroke-dasharray="3 2" stroke-width="${n(font * 0.08)}"` : ""} clip-path="url(#${prefix}-clip)"/>`,
				);
				if (j % 5)
					marks.push(
						`<rect ${box} fill="${patternFill(prefix, j)}" clip-path="url(#${prefix}-clip)"/>`,
					);
				if (
					style.showValues &&
					fi >= 1 &&
					(groups * data.categories.length <= 24 || thick > font * 1.4)
				) {
					const neg = v.value < L.baseline;
					labels.push(
						L.horizontal
							? text(
									neg ? end - font * 0.3 : end + font * 0.3,
									along + font * 0.3,
									labelFor(v),
									font * 0.75,
									`fill="${t.text}" font-weight="600" text-anchor="${neg ? "end" : "start"}"`,
								)
							: text(
									along,
									neg ? end + font * 0.95 : end - font * 0.35,
									labelFor(v),
									font * 0.75,
									`fill="${t.text}" font-weight="600" text-anchor="middle"`,
								),
					);
				}
			});
		});
	} else if (data.kind === "pie") {
		const s = data.series[0];
		const total = pieTotal(data);
		const listW = Math.min(
			P.w * 0.48,
			Math.max(...data.categories.map((c) => textWidth(c, font * 0.85))) + font * 7,
		);
		const radius = Math.max(4, Math.min((P.w - listW) / 2, P.h / 2) * 0.92);
		const cx = P.x + radius + font * 0.4,
			cy = P.y + P.h / 2;
		const inner = data.donut ? radius * 0.56 : 0;
		const arc = (a0: number, a1: number) => {
			const pt = (a: number, rr: number) =>
				`${n(cx + rr * Math.sin(a))},${n(cy - rr * Math.cos(a))}`;
			const large = a1 - a0 > Math.PI ? 1 : 0;
			if (a1 - a0 >= Math.PI * 2 - 1e-6) {
				const ring = `M${pt(0, radius)}A${n(radius)},${n(radius)} 0 1,1 ${pt(Math.PI, radius)}A${n(radius)},${n(radius)} 0 1,1 ${pt(0, radius)}Z`;
				return inner
					? `${ring}M${pt(0, inner)}A${n(inner)},${n(inner)} 0 1,0 ${pt(Math.PI, inner)}A${n(inner)},${n(inner)} 0 1,0 ${pt(0, inner)}Z`
					: ring;
			}
			return inner
				? `M${pt(a0, radius)}A${n(radius)},${n(radius)} 0 ${large},1 ${pt(a1, radius)}L${pt(a1, inner)}A${n(inner)},${n(inner)} 0 ${large},0 ${pt(a0, inner)}Z`
				: `M${n(cx)},${n(cy)}L${pt(a0, radius)}A${n(radius)},${n(radius)} 0 ${large},1 ${pt(a1, radius)}Z`;
		};
		out.push(
			`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(radius)}" fill="none" stroke="${t.grid}" stroke-dasharray="4 3"/>`,
		);
		let angle = 0;
		const valid = total > 0 && Number.isFinite(total);
		const rowH = Math.min(font * 1.5, P.h / Math.max(1, data.categories.length + 1));
		const listX = cx + radius + font * 1.2;
		const listY =
			cy -
			(rowH * (data.categories.length + (data.pieTotal.mode === "fixed" ? 1 : 0))) / 2 +
			rowH * 0.7;
		s.values.forEach((v, i) => {
			const share = valid && v.value !== null ? v.value / total : 0;
			const fi = clamp01(p - i);
			const fill = seriesColor(
				i === 0 ? s.color : CHART_PALETTE[i % CHART_PALETTE.length],
				style.theme,
			);
			if (fi > 0 && share > 0) {
				const d = arc(angle, angle + share * Math.PI * 2 * fi);
				marks.push(
					`<path d="${d}" fill="${fill}" fill-rule="evenodd" fill-opacity="${v.confidence === "estimated" ? 0.6 : 1}" stroke="${L.theme.bg === "none" ? "#ffffff" : L.theme.bg}" stroke-width="${n(Math.max(1, font * 0.08))}"/>`,
				);
				if (i % 5)
					marks.push(
						`<path d="${d}" fill="${patternFill(prefix, i)}" fill-rule="evenodd"/>`,
					);
			}
			angle += share * Math.PI * 2;
			const rowY = listY + i * rowH;
			const size = Math.min(font * 0.85, rowH * 0.7);
			labels.push(
				`<rect x="${n(listX)}" y="${n(rowY - size * 0.85)}" width="${n(size)}" height="${n(size)}" fill="${fill}"/>${i % 5 ? `<rect x="${n(listX)}" y="${n(rowY - size * 0.85)}" width="${n(size)}" height="${n(size)}" fill="${patternFill(prefix, i)}"/>` : ""}`,
			);
			const value =
				fi >= 1 && v.value !== null
					? ` ${labelFor(v)}${data.unit.suffix.trim() === "%" && data.pieTotal.mode === "sum" ? "" : ` (${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%)`}`
					: "";
			const room = P.x + P.w - listX - size * 1.6;
			const name = fitText(
				data.categories[i],
				Math.max(10, room - textWidth(value, size)),
				size,
			);
			labels.push(
				text(
					listX + size * 1.5,
					rowY,
					`${name}${value}`,
					size,
					`fill="${t.text}"`,
					data.categories[i],
				),
			);
		});
		if (data.pieTotal.mode === "fixed" && valid) {
			const sum = s.values.reduce((a, v) => a + (v.value ?? 0), 0);
			const rest = (total - sum) / total;
			const rowY = listY + s.values.length * rowH;
			const size = Math.min(font * 0.85, rowH * 0.7);
			if (rest > 1e-9 && p >= steps) {
				marks.push(
					`<path d="${arc(angle, Math.PI * 2)}" fill="${t.grid}" fill-rule="evenodd" stroke="${L.theme.bg === "none" ? "#ffffff" : L.theme.bg}"/>`,
				);
				labels.push(
					text(
						listX + size * 1.5,
						rowY,
						`Not shown (${(rest * 100).toFixed(rest < 0.1 ? 1 : 0)}%)`,
						size,
						`fill="${t.muted}"`,
					),
				);
			}
		}
	} else {
		const v = data.series[0].values[0];
		const fi = clamp01(p);
		const valueText = v ? formatValue(v, data) : "n/a";
		const size = Math.min(P.h * 0.5, (P.w / Math.max(3, [...valueText].length)) * 1.6);
		out.push(
			text(
				P.x + P.w / 2,
				P.y + P.h * 0.82,
				fitText(data.categories[0] ?? "", P.w, font * 1.05),
				font * 1.05,
				`fill="${t.muted}" text-anchor="middle"`,
				data.categories[0],
			),
		);
		marks.push(
			`<g opacity="${n(fi)}">${text(P.x + P.w / 2, P.y + P.h * 0.5 + size * 0.35, valueText, size, `fill="${seriesColor(data.series[0].color, style.theme)}" font-weight="700" text-anchor="middle"`)}</g>`,
		);
	}
	out.push(...marks, ...labels);
	L.footer.forEach((line, i) =>
		out.push(
			text(
				Math.max(8, font * 0.9),
				height - Math.max(8, font * 0.9) - (L.footer.length - 1 - i) * font * 1.05,
				line,
				font * 0.75,
				`fill="${t.muted}"`,
			),
		),
	);
	out.push("</svg>");
	return out.join("");
}
export const chartDataURL = (
	chart: RenderableChart,
	width = 320,
	height = 200,
	reveal = Number.POSITIVE_INFINITY,
) =>
	`data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderChartSvg(chart, { width, height, reveal, idPrefix: "thumb" }))}`;
