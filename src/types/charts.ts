/** Durable chart data. Rendering is always derived from this structured data,
 * never from an AI-generated bitmap. Transient reveal state lives in ChartPlayback. */
export type ChartKind = "line" | "bar" | "pie" | "card";
/** printed: read from a printed label/table. estimated: measured from geometry.
 * unreadable: could not be read, value stays null. manual: typed or edited by the presenter. */
export type ValueConfidence = "printed" | "estimated" | "unreadable" | "manual";
export interface ChartValue {
	value: number | null;
	confidence: ValueConfidence;
}
export interface ChartSeries {
	id: string;
	name: string;
	color: string;
	values: ChartValue[];
}
export interface ChartData {
	kind: ChartKind;
	title: string;
	subtitle: string;
	/** X labels for line/bar, slice labels for pie, a single label for a card. */
	categories: string[];
	xType: "category" | "date";
	series: ChartSeries[];
	unit: { prefix: string; suffix: string };
	yAxis: {
		label: string;
		scale: "linear" | "log";
		min: number | null;
		max: number | null;
		/** What the source screenshot used, e.g. "Axis starts at 40" or "log scale". */
		sourceScaleNote: string;
	};
	orientation: "vertical" | "horizontal";
	donut: boolean;
	/** Pie totals must be explicit: either the sum of shown slices, or a fixed whole. */
	pieTotal: { mode: "sum" | "fixed"; value: number | null };
	decimals: number | null;
}
export interface ChartSource {
	url: string;
	publisher: string;
	published: string;
	dateRange: string;
	notes: string;
	method: "ai" | "manual" | "mcp";
	model: string;
	extractedAt: number;
	hasImage: boolean;
	warnings: string[];
}
export interface ChartReveal {
	order: "category" | "series";
	msPerStep: number;
	animate: boolean;
}
export interface ChartStyle {
	theme: "light" | "dark" | "board";
	showSource: boolean;
	showValues: boolean;
	legend: boolean;
}
export interface ChartDocument {
	format: "mistarecorda-chart";
	version: 1;
	id: string;
	name: string;
	revision: number;
	/** Drafts come from AI or MCP and stay private until the presenter confirms them. */
	status: "draft" | "reviewed";
	created: number;
	updated: number;
	data: ChartData;
	/** The values as first extracted or imported. Kept for comparison and reset. */
	original: ChartData | null;
	source: ChartSource;
	reveal: ChartReveal;
	style: ChartStyle;
}
/** Transient reveal clock. position moves toward target at one step per msPerStep from anchorAt. */
export interface ChartPlayback {
	chartId: string;
	position: number;
	target: number;
	anchorAt: number;
	msPerStep: number;
	seq: number;
}
export interface ChartJob {
	phase: "idle" | "analyzing" | "ready" | "error";
	jobId: string;
	started: number;
	error: string;
	chartId?: string;
}
export interface ChartInfo {
	charts: ChartDocument[];
	playback: Record<string, ChartPlayback>;
	job: ChartJob;
	hasKey: boolean;
	serverNow: number;
}
/** The canvas object that carries a chart: an invisible, selectable rectangle. */
export interface ChartElementMeta {
	chartId: string;
}
