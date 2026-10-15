export type PresenterObjectKind = "image" | "meme" | "sound" | "link";
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
}
export interface PresenterDocument {
	version: 1;
	notesVersion: number;
	notes: TalkingNotes;
	links: PresenterLink[];
	preferences: Record<string, ObjectPreference>;
}
export interface PresenterObject extends ObjectReference {
	name: string;
	preview?: string;
	detail: string;
	widthPercent?: number;
}
export const objectKey = (object: ObjectReference) => `${object.kind}:${object.id}`;
export const emptyPresenterDocument = (): PresenterDocument => ({
	version: 1,
	notesVersion: 0,
	notes: { body: "", references: {} },
	links: [],
	preferences: {},
});
