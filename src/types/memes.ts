export type MemeTransition = "none" | "fade" | "spin" | "fall";
export interface MemeAsset {
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
