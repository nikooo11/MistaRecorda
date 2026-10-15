import type { BoardState } from "../../types/board";
import { sortedMemes } from "./memePreferences";
import type { SoundEffect } from "../../types/studio";
import {
	objectKey,
	type PresenterDocument,
	type PresenterLink,
	type PresenterObject,
	type TalkingNotes,
} from "../../types/presenter";

/** These URLs are opened by Chrome, never fetched by the app's backend. */
export function presenterURL(value: string): URL {
	const url = new URL(value);
	if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
		throw Error("Use an http or https webpage link without a password in the URL.");
	return url;
}
export function linkDestination(link: PresenterLink): string {
	const url = presenterURL(link.url);
	const target = link.target.trim();
	if (link.startAt === "text" && target) {
		// Hyphens and commas are text-fragment delimiters even after encodeURIComponent.
		const text = encodeURIComponent(target).replace(
			/[-!'()*]/g,
			(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
		);
		url.hash = `:~:text=${text}`;
	} else if (link.startAt === "anchor" && target)
		url.hash = encodeURIComponent(target.replace(/^#/, ""));
	return url.href;
}
export function presenterObjects(
	state: BoardState,
	doc: PresenterDocument,
	sounds: Omit<SoundEffect, "file">[],
): PresenterObject[] {
	return [
		...Object.values(state.assets).map(
			(a): PresenterObject => ({
				kind: "image",
				id: a.id,
				name: a.name || "Saved image",
				preview: a.dataURL,
				detail: "Image · place & resize",
			}),
		),
		...sortedMemes(state).map(
			(a): PresenterObject => ({
				kind: "meme",
				id: a.id,
				name: a.name,
				preview: a.dataURL,
				detail: `Meme · ${a.enter === "none" ? "no entrance" : `${a.enter} in`}${a.loved ? " · ♥" : ""}${state.favoriteMemeIds?.includes(a.id) ? " · ★" : ""}`,
				searchTerms: [a.description ?? "", ...(a.tags ?? [])],
				containsAudio: !!a.soundId,
				shadow: a.shadow,
			}),
		),
		...sounds.map(
			(a): PresenterObject => ({
				kind: "sound",
				id: a.id,
				name: a.name,
				detail: `Sound · ${(a.durationMs / 1000).toFixed(1)}s${a.favorite ? " · ★" : ""}`,
			}),
		),
		...doc.links.map(
			(a): PresenterObject => ({
				kind: "link",
				id: a.id,
				name: a.name,
				detail: `Chrome · ${presenterURL(a.url).hostname}`,
			}),
		),
		...(doc.canvasNotes ?? []).map(
			(n): PresenterObject => ({
				kind: "note",
				id: n.id,
				name: n.name,
				text: n.text,
				detail: "Note · private by default",
				shadow: true,
			}),
		),
	].map((a) => ({ ...a, ...doc.preferences[objectKey(a)] }));
}
export function referenceToken(notes: TalkingNotes, object: PresenterObject) {
	const existing = Object.entries(notes.references).find(
		([, ref]) => objectKey(ref) === objectKey(object),
	);
	if (existing) return existing[0];
	const base = object.name.replace(/[{}\n\r]/g, " ").trim() || object.kind;
	let token = base;
	for (
		let n = 2;
		Object.keys(notes.references).includes(token) ||
		["__proto__", "constructor", "prototype"].includes(token);
		n++
	)
		token = `${base} ${n}`;
	return token;
}
export function mentionAt(body: string, caret: number) {
	const match = /(?:^|\s)@([^@{}\n]{0,80})$/.exec(body.slice(0, caret));
	return match ? { start: caret - match[1].length - 1, query: match[1] } : null;
}
export type NotePart =
	| { type: "text" | "bold"; text: string }
	| { type: "reference"; text: string }
	| { type: "link"; text: string; url: string };
export function noteParts(line: string): NotePart[] {
	const parts: NotePart[] = [];
	const pattern =
		/@\{([^}\n]+)\}|\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)/g;
	let index = 0;
	for (const m of line.matchAll(pattern)) {
		if (m.index! > index) parts.push({ type: "text", text: line.slice(index, m.index) });
		if (m[1]) parts.push({ type: "reference", text: m[1] });
		else if (m[2]) parts.push({ type: "bold", text: m[2] });
		else {
			const url = m[4] || m[5];
			try {
				parts.push({ type: "link", text: m[3] || url, url: presenterURL(url).href });
			} catch {
				parts.push({ type: "text", text: m[0] });
			}
		}
		index = m.index! + m[0].length;
	}
	if (index < line.length) parts.push({ type: "text", text: line.slice(index) });
	return parts;
}

/** getRandomValues is available on the paired iPad's LAN HTTP page. randomUUID is not. */
export function presenterId() {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6] & 15) | 64;
	bytes[8] = (bytes[8] & 63) | 128;
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
