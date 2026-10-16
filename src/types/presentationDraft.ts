export interface PDFPageInput {
	page: number;
	text: string;
	image?: string;
}
export interface PresentationSuggestion {
	kind: "existing" | "link" | "chart";
	label: string;
	/** Existing library key (kind:id), a URL, or an empty string for a chart. */
	target: string;
	chart?: { kind: "bar" | "line" | "pie"; labels: string[]; values: number[]; unit: string };
}
export interface PresentationPoint {
	text: string;
	page: number;
	evidence: string;
	suggestions: PresentationSuggestion[];
}
export interface PresentationDraft {
	title: string;
	recommendation: string;
	points: PresentationPoint[];
	warnings: string[];
	baseVersion: number;
}
export interface PresentationJob {
	id: string;
	phase: "idle" | "working" | "ready" | "error";
	message: string;
	draft?: PresentationDraft;
}
