import { describe, expect, test } from "vitest";
import type { ChartData, ChartDocument, ChartPlayback } from "../../../types/charts";
import {
	addCategory,
	blockingIssues,
	changeKind,
	chartIssues,
	createHistory,
	emptyChartData,
	formatValue,
	isEditedFromSource,
	newChartDocument,
	parseDateLabel,
	pushHistory,
	redo,
	revealSteps,
	setValue,
	snapValue,
	undo,
} from "./chartModel";
import {
	acceptPlayback,
	applyPlayback,
	initialPlayback,
	isPlaying,
	revealAt,
	renderedReveal,
} from "./chartPlayback";
import { chartLayout, renderChartSvg } from "./chartRender";

const v = (
	value: number | null,
	confidence: "printed" | "estimated" | "unreadable" | "manual" = "printed",
) => ({ value, confidence });
function data(
	kind: ChartData["kind"],
	values: Array<number | null>,
	extra: Partial<ChartData> = {},
): ChartData {
	const base = emptyChartData(kind);
	const categories = values.map((_, i) => `C${i + 1}`);
	return {
		...base,
		title: "Test chart",
		categories,
		series: [{ ...base.series[0], name: "Value", values: values.map((x) => v(x)) }],
		...extra,
	};
}
const doc = (d: ChartData): ChartDocument => ({
	...newChartDocument("00000000-0000-4000-8000-000000000001", d, "ai", 0),
	status: "reviewed",
});
const svg = (d: ChartData, reveal = Number.POSITIVE_INFINITY, w = 640, h = 400) =>
	renderChartSvg(doc(d), { width: w, height: h, reveal, idPrefix: "t" });

describe("statistical validation", () => {
	test("missing values stay null and are never treated as zero", () => {
		const d = data("bar", [5, null, 7]);
		expect(blockingIssues(d)).toEqual([]);
		expect(chartIssues(d).map((i) => i.message)).toContain(
			"Missing values are shown as gaps, not zero.",
		);
		const out = svg(d);
		expect(out).toContain("n/a");
		// Two bars (and no zero-height bar for the gap).
		expect(
			out.match(/<rect x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+" fill="#0072B2"/g)
				?.length,
		).toBe(2);
		expect(formatValue(v(null), d)).toBe("n/a");
	});
	test("pie totals must be explicit and consistent", () => {
		expect(blockingIssues(data("pie", [40, null])).length).toBeGreaterThan(0);
		expect(blockingIssues(data("pie", [40, -2])).some((i) => /negative/.test(i.message))).toBe(
			true,
		);
		const over = data("pie", [60, 50], { pieTotal: { mode: "fixed", value: 100 } });
		expect(blockingIssues(over)[0].message).toMatch(/more than the stated whole/);
		const missingTotal = data("pie", [60, 30], { pieTotal: { mode: "fixed", value: null } });
		expect(blockingIssues(missingTotal)[0].message).toMatch(/Enter the whole/);
		const partial = data("pie", [60, 30], { pieTotal: { mode: "fixed", value: 100 } });
		expect(blockingIssues(partial)).toEqual([]);
		expect(svg(partial)).toContain("Not shown (10%)");
		const pct = data("pie", [50, 30], { unit: { prefix: "", suffix: "%" } });
		expect(chartIssues(pct).some((i) => /add up to 80%/.test(i.message))).toBe(true);
		const multi = data("pie", [1, 2]);
		multi.series.push({ ...multi.series[0], id: "s2", name: "Other" });
		expect(blockingIssues(multi)[0].message).toMatch(/one series/);
	});
	test("log scale and truncated bar axes are disclosed, invalid ranges blocked", () => {
		expect(
			blockingIssues(
				data("line", [0, 10], {
					yAxis: { label: "", scale: "log", min: null, max: null, sourceScaleNote: "" },
				}),
			)[0].message,
		).toMatch(/log scale/i);
		const log = data("line", [1, 10, 1000], {
			yAxis: { label: "", scale: "log", min: null, max: null, sourceScaleNote: "" },
		});
		expect(blockingIssues(log)).toEqual([]);
		expect(svg(log)).toContain("Log scale");
		const truncated = data("bar", [50, 60], {
			yAxis: { label: "", scale: "linear", min: 40, max: null, sourceScaleNote: "" },
		});
		expect(blockingIssues(truncated)).toEqual([]);
		expect(svg(truncated)).toContain("Axis starts at 40");
		const hidden = data("bar", [10, 60], {
			yAxis: { label: "", scale: "linear", min: 40, max: null, sourceScaleNote: "" },
		});
		expect(blockingIssues(hidden)[0].message).toMatch(/outside the axis range/);
	});
	test("bars default to a zero baseline and handle negative values", () => {
		const d = data("bar", [-20, 0, 35.5]);
		const L = chartLayout(doc(d), 600, 400);
		expect(L.domain[0]).toBeLessThanOrEqual(-20);
		expect(L.domain[1]).toBeGreaterThanOrEqual(35.5);
		expect(L.baseline).toBe(0);
		const pos = chartLayout(doc(data("bar", [30, 35])), 600, 400);
		expect(pos.domain[0]).toBe(0);
		expect(svg(d)).toContain("−20");
	});
	test("percentages, decimals and large magnitudes format consistently", () => {
		const pct = data("bar", [12.5, 3], { unit: { prefix: "", suffix: "%" } });
		expect(formatValue(pct.series[0].values[0], pct)).toBe("12.5%");
		const money = data("bar", [2_400_000_000, 1], { unit: { prefix: "$", suffix: "" } });
		expect(formatValue(money.series[0].values[0], money, true)).toBe("$2.4B");
		expect(formatValue(v(0.00042, "estimated"), data("bar", [1]))).toBe("≈0.00042");
	});
	test("dates keep their real spacing on a line chart", () => {
		expect(parseDateLabel("2024-Q3")).toBe(Date.UTC(2024, 6, 1));
		expect(parseDateLabel("2024-02-30")).toBeNull();
		const d = data("line", [1, 2, 3], { xType: "date", categories: ["2000", "2001", "2010"] });
		const L = chartLayout(doc(d), 800, 400);
		const gap1 = L.categoryPx(1) - L.categoryPx(0),
			gap2 = L.categoryPx(2) - L.categoryPx(1);
		expect(gap2 / gap1).toBeCloseTo(9, 0);
		expect(blockingIssues({ ...d, categories: ["2000", "soon", "2010"] })[0].message).toMatch(
			/Date labels/,
		);
	});
	test("untrusted labels are escaped and long labels truncated", () => {
		const d = data("bar", [1, 2]);
		d.title = `<script>alert(1)</script>"onload="x`;
		d.categories = [
			"A very long category label that will not fit under a narrow bar at all",
			"B",
		];
		const out = svg(d, Number.POSITIVE_INFINITY, 320, 220);
		expect(out).not.toContain("<script>");
		expect(out).toContain("&lt;script&gt;");
		expect(out).toContain("…");
	});
	test("changing type never drops series", () => {
		const d = data("bar", [1, 2]);
		d.series.push({ ...d.series[0], id: "s2", name: "B" });
		const pie = changeKind(d, "pie");
		expect(pie.series.length).toBe(2);
		expect(blockingIssues(pie).length).toBeGreaterThan(0);
	});
});

describe("editing", () => {
	test("dragging a point maps pixels to snapped values and back to the same table value", () => {
		const d = data("line", [10, 20, 30]);
		const L = chartLayout(doc(d), 800, 500);
		const handle = L.handles[0][1]!;
		const dragged = snapValue(L.pxToValue(handle.y - 37), L.tickStep, d);
		const next = setValue(d, 0, 1, dragged);
		expect(next.series[0].values[1]).toEqual({ value: dragged, confidence: "manual" });
		const after = chartLayout(doc(next), 800, 500).handles[0][1]!;
		expect(Math.abs(after.y - (handle.y - 37))).toBeLessThan(L.plot.h / 20);
		expect(dragged % (L.tickStep / 10)).toBeCloseTo(0, 6);
		// Resizing the object changes geometry only, never the values.
		const bigger = chartLayout(doc(next), 1600, 1000);
		expect(bigger.pxToValue(bigger.handles[0][1]!.y)).toBeCloseTo(dragged, 6);
	});
	test("undo/redo and edited-from-source tracking", () => {
		const d0 = data("bar", [1, 2]);
		const original = doc(d0);
		let h = createHistory(d0);
		h = pushHistory(h, setValue(d0, 0, 0, 5));
		h = pushHistory(h, addCategory(h.present));
		expect(h.present.categories.length).toBe(3);
		expect(isEditedFromSource({ ...original, data: h.present })).toBe(true);
		h = undo(undo(h));
		expect(h.present).toEqual(d0);
		expect(isEditedFromSource({ ...original, data: h.present })).toBe(false);
		h = redo(h);
		expect(h.present.series[0].values[0].value).toBe(5);
		expect(svg(h.present)).not.toContain("Edited from source");
		expect(
			renderChartSvg(
				{ ...original, data: h.present },
				{ width: 600, height: 400, reveal: 99, idPrefix: "x" },
			),
		).toContain("Edited from source");
	});
});

describe("reveal", () => {
	const p0 = initialPlayback("c", 1000);
	test("title and axes show before data; reveal is deterministic", () => {
		const d = data("bar", [3, 4, 5]);
		const empty = svg(d, 0);
		expect(empty).toContain("Test chart");
		expect(empty).toContain("C1");
		expect(empty).not.toMatch(/fill="#0072B2"/);
		const one = svg(d, 1);
		expect(one.match(/fill="#0072B2"/g)?.length).toBe(1);
		expect(svg(d, 1)).toBe(one);
		// Axis range is stable while revealing.
		expect(empty.match(/<line[^>]+stroke="#e2e6eb"/g)).toEqual(
			svg(d, 3).match(/<line[^>]+stroke="#e2e6eb"/g),
		);
	});
	test("play, pause, resume and backwards scrubbing use one logical clock", () => {
		const steps = 5;
		let p = applyPlayback(p0, { action: "play" }, steps, 1000, 2000);
		expect(revealAt(p, 3500, steps)).toBe(1.5);
		expect(isPlaying(p, 3500, steps)).toBe(true);
		p = applyPlayback(p, { action: "pause" }, steps, 1000, 3500);
		expect(revealAt(p, 99999, steps)).toBe(1.5);
		p = applyPlayback(p, { action: "play" }, steps, 1000, 5000);
		expect(revealAt(p, 5500, steps)).toBe(2);
		p = applyPlayback(p, { action: "seek", position: 0.5 }, steps, 1000, 6000);
		expect(revealAt(p, 9000, steps)).toBe(0.5);
		p = applyPlayback(p, { action: "next" }, steps, 1000, 9000);
		expect(revealAt(p, 9250, steps)).toBe(0.75);
		expect(revealAt(p, 20000, steps)).toBe(1);
		// Quick repeated Next taps queue whole steps while the first is still animating.
		let q = applyPlayback(p, { action: "next" }, steps, 1000, 20000);
		q = applyPlayback(q, { action: "next" }, steps, 1000, 20100);
		expect(q.target).toBe(3);
		expect(revealAt(q, 20100, steps)).toBeCloseTo(1.1, 6);
		p = applyPlayback(p, { action: "previous" }, steps, 1000, 20000);
		expect(revealAt(p, 20000, steps)).toBe(0);
		p = applyPlayback(p, { action: "showAll" }, steps, 1000, 21000);
		expect(revealAt(p, 21000, steps)).toBe(5);
		p = applyPlayback(p, { action: "play" }, steps, 1000, 22000);
		expect(revealAt(p, 22000, steps)).toBe(0);
		expect(renderedReveal(2.7, false)).toBe(2);
	});
	test("stale playback events are ignored", () => {
		const a: ChartPlayback = { ...p0, seq: 3, position: 2, target: 2 };
		const b: ChartPlayback = { ...p0, seq: 2, position: 0, target: 0 };
		const state = acceptPlayback({}, a);
		expect(acceptPlayback(state, b)).toBe(state);
		expect(acceptPlayback(state, { ...a, seq: 4, position: 1, target: 1 }).c.position).toBe(1);
	});
	test("steps follow chart type and reveal order", () => {
		const d = data("line", [1, 2, 3, 4]);
		expect(revealSteps(d, "category")).toBe(4);
		d.series.push({ ...d.series[0], id: "s2", name: "B" });
		expect(revealSteps(d, "series")).toBe(2);
		expect(revealSteps(data("card", [7]), "category")).toBe(1);
	});
});
