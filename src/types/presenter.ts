export type PresenterObjectKind = "image" | "meme" | "sound" | "link" | "note";
export interface ObjectReference {
	kind: PresenterObjectKind;
	id: string;
}
export interface TalkingNotes {
	body: string;
	/** Human-readable tokens map to stable IDs, so renaming never breaks a reference. */
	references: Record<string, ObjectReference>;
}
export interface PresenterLink {
	id: string;
	name: string;
	url: string;
	startAt: "url" | "text" | "anchor";
	target: string;
}
export interface ObjectPreference {
	name?: string;
	widthPercent?: number;
	shadow?: boolean;
	enter?: import("./memes").MemeTransition;
}
export interface PresenterNote {
	id: string;
	name: string;
	text: string;
}
export interface PresenterDocument {
	version: 1;
	notesVersion: number;
	notes: TalkingNotes;
	links: PresenterLink[];
	preferences: Record<string, ObjectPreference>;
	canvasNotes?: PresenterNote[];
}
export interface PresenterObject extends ObjectReference {
	name: string;
	preview?: string;
	detail: string;
	widthPercent?: number;
	shadow?: boolean;
	enter?: import("./memes").MemeTransition;
	text?: string;
}
export const objectKey = (object: ObjectReference) => `${object.kind}:${object.id}`;
export const emptyPresenterDocument = (): PresenterDocument => ({
	version: 1,
	notesVersion: 0,
	notes: { body: "", references: {} },
	links: [],
	preferences: {},
	canvasNotes: [],
});
