export type BoardMode = "screen" | "board";
export type BoardElement = Record<string, unknown> & {
	id: string;
	type: string;
	version: number;
	isDeleted?: boolean;
};
export interface BoardFile {
	id: string;
	dataURL: string;
	mimeType: string;
	created: number;
	name?: string;
}
export interface BoardScene {
	elements: BoardElement[];
	files: Record<string, BoardFile>;
	scrollX: number;
	scrollY: number;
	zoom: number;
}
export interface WhiteboardPage {
	id: string;
	name: string;
	scene: BoardScene;
	memes: import("./memes").PlacedMeme[];
}
export interface BoardState {
	whiteboards?: WhiteboardPage[];
	activeWhiteboardId?: string;
	memes?: import("./memes").MemeAsset[];
	favoriteMemeIds?: string[];
	installedDefaultMemeIds?: string[];
	memeDefaultsVersion?: 1;
	placedMemes?: Record<BoardMode, import("./memes").PlacedMeme[]>;
	version: 1;
	revision: number;
	enabled: boolean;
	drawingDefaultsVersion?: 1;
	mode: BoardMode;
	output: "screen" | "screen-board" | "board";
	width: number;
	height: number;
	scenes: Record<BoardMode, BoardScene>;
	library: unknown[];
	assets: Record<string, BoardFile>;
}
export const emptyBoardScene = (): BoardScene => ({
	elements: [],
	files: {},
	scrollX: 0,
	scrollY: 0,
	zoom: 1,
});
export const emptyBoardState = (): BoardState => ({
	version: 1,
	revision: 0,
	enabled: true,
	drawingDefaultsVersion: 1,
	mode: "screen",
	output: "screen-board",
	width: 1280,
	height: 720,
	scenes: { screen: emptyBoardScene(), board: emptyBoardScene() },
	library: [],
	assets: {},
	memes: [],
	placedMemes: { screen: [], board: [] },
});
export interface BoardStatus {
	recording: boolean;
	paused: boolean;
	elapsed: number;
	webcam: boolean;
	webcamDeviceId?: string;
	sourceId?: string;
	sourceName?: string;
}
export interface BoardDevice {
	id: string;
	name: string;
	approved: boolean;
	connected: boolean;
}
export interface BoardInfo {
	panelTab?: "draw" | "ipad" | "scenes" | "settings";
	state: BoardState;
	status: BoardStatus;
	devices: BoardDevice[];
	pairing?: { urls: string[]; code: string; expires: number };
	mcp?: { url: string; token: string };
	remoteControl?: { url: string; token: string };
	displays: Array<{ id: number; name: string }>;
	displayId: number;
}
export interface BoardAPI {
	request: <T = unknown>(method: string, input?: unknown) => Promise<T>;
	on: <T = unknown>(event: string, callback: (data: T) => void) => () => void;
}
