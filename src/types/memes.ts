export type MemeTransition = "none" | "fade" | "spin" | "fall";
export interface MemeShake {
	target: "meme" | "screen";
	strength: number;
	durationMs: number;
}
export const DEFAULT_MEME_PLAYBACK = {
	enter: "none",
	exit: "spin",
	stayUntilClicked: false,
	durationSeconds: 3,
} as const;
export interface MemeAsset {
	shake?: MemeShake;
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
	shake?: MemeShake;
	shakeAt?: number;
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
