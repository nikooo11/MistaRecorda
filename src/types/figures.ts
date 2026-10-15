export interface FigureSuggestion {
	id: string;
	title: string;
	kind: "chart" | "figure" | "broll" | "meme";
	memeId?: string;
	summary: string;
	url: string;
	source: string;
	imageUrl: string | null;
	usage: string;
	prompt: string;
}
export interface FigureState {
	hasKey: boolean;
	phase: "idle" | "listening" | "transcribing" | "searching" | "generating" | "ready" | "error";
	started: number;
	topic: string;
	results: FigureSuggestion[];
	error: string;
	preview?: { dataURL: string; title: string };
	cleanupWarning?: string;
}
