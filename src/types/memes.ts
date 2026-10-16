export type MemeTransition = "none" | "fade" | "spin" | "fall";
export const DEFAULT_MEME_PLAYBACK = {
	enter: "none",
	exit: "spin",
	stayUntilClicked: false,
	durationSeconds: 3,
} as const;
export interface MemeAsset {
	tags?: string[];
	description?: string;
	loved?: boolean;
	shadow?: boolean;
	id: string;
	name: string;
	dataURL: string;
	width: number;
	height: number;
	enter: MemeTransition;
	exit: MemeTransition;
	stayUntilClicked: boolean;
	durationSeconds: number;
	soundId: string;
}
export interface PlacedMeme {
	shadow?: boolean;
	id: string;
	assetId: string;
	x: number;
	y: number;
	width: number;
	height: number;
	placedAt: number;
	removedAt?: number;
	enter: MemeTransition;
	exit: MemeTransition;
	stayUntilClicked: boolean;
	durationSeconds: number;
}
