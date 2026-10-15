import type { BoardElement } from "../../types/board";
import type { MemeTransition } from "../../types/memes";
import type { ObjectReference } from "../../types/presenter";

export interface PresentationMeta {
	shadow: boolean;
	publicOpacity: number;
	enter: MemeTransition;
	revealedAt?: number;
	reference?: ObjectReference;
}
export const SHADOW_HELP =
	"Shadow objects stay at 50% opacity on the iPad only. They are hidden from the computer and recording until you choose Show on screen. Grouped objects are shown or hidden together.";
export function presentationMeta(element: BoardElement): PresentationMeta | undefined {
	return (element?.customData as { presentation?: PresentationMeta } | undefined)?.presentation;
}
export const isShadow = (element: BoardElement) => presentationMeta(element)?.shadow === true;
export function setShadow(
	element: BoardElement,
	shadow: boolean,
	enter?: MemeTransition,
	now = Date.now(),
): BoardElement {
	const old = presentationMeta(element);
	const opacity = old?.shadow
		? old.publicOpacity
		: typeof element.opacity === "number"
			? element.opacity
			: 100;
	return {
		...element,
		opacity: shadow ? 50 : opacity,
		version: element.version + 1,
		updated: now,
		customData: {
			...(element.customData as object),
			presentation: {
				...old,
				shadow,
				publicOpacity: opacity,
				enter: enter ?? old?.enter ?? "none",
				revealedAt: !shadow && old?.shadow ? now : undefined,
			} satisfies PresentationMeta,
		},
	};
}
/** A visibility change targets the entire group, even when one member is selected. */
export function shadowSelectionIds(
	elements: readonly BoardElement[],
	selectedIds: readonly string[],
) {
	const live = elements.filter((e) => !e.isDeleted);
	const byId = new Map(live.map((e) => [e.id, e]));
	const groups = new Map<string, string[]>();
	const children = new Map<string, string[]>();
	const groupIds = (e: BoardElement): string[] =>
		Array.isArray(e.groupIds)
			? e.groupIds.filter((id): id is string => typeof id === "string")
			: [];
	for (const e of live) {
		for (const group of groupIds(e)) {
			if (!groups.has(group)) groups.set(group, []);
			groups.get(group)!.push(e.id);
		}
		for (const parent of [e.containerId, e.frameId])
			if (typeof parent === "string") {
				if (!children.has(parent)) children.set(parent, []);
				children.get(parent)!.push(e.id);
			}
	}
	const ids = new Set<string>();
	const visitedGroups = new Set<string>();
	const queue = [...selectedIds];
	for (let i = 0; i < queue.length; i++) {
		const id = queue[i],
			element = byId.get(id);
		if (!element || ids.has(id)) continue;
		ids.add(id);
		// A bound label belongs to its container, but selecting a frame child does
		// not by itself select the whole frame. Selecting the frame includes its children.
		if (typeof element.containerId === "string") queue.push(element.containerId);
		queue.push(...(children.get(id) ?? []));
		for (const group of groupIds(element)) {
			if (visitedGroups.has(group)) continue;
			visitedGroups.add(group);
			queue.push(...(groups.get(group) ?? []));
		}
	}
	return ids;
}
export function shadowIds(elements: readonly BoardElement[]) {
	const ids = new Set(elements.filter(isShadow).map((e) => e.id));
	// Bound labels and frame children must never outlive their private container visually.
	let added = true;
	while (added) {
		added = false;
		for (const e of elements)
			if (!ids.has(e.id) && (ids.has(String(e.containerId)) || ids.has(String(e.frameId)))) {
				ids.add(e.id);
				added = true;
			}
	}
	return ids;
}
/** The same filter is used on initial load, live edits and recording animation frames. */
export function visibleElements(
	elements: readonly BoardElement[],
	tablet: boolean,
	now?: number,
): BoardElement[] {
	const hidden = shadowIds(elements);
	return elements
		.filter((e) => tablet || !hidden.has(e.id))
		.map((e) => {
			if (hidden.has(e.id)) return e.opacity === 50 ? e : { ...e, opacity: 50 };
			const meta = presentationMeta(e);
			if (tablet || now === undefined || !meta?.revealedAt || meta.enter === "none") return e;
			const progress = Math.max(0, Math.min(1, (now - meta.revealedAt) / 450));
			if (progress === 1) return e;
			return {
				...e,
				opacity: meta.publicOpacity * progress,
				...(meta.enter === "spin"
					? { angle: Number(e.angle) - (1 - progress) * Math.PI * 2 }
					: {}),
				...(meta.enter === "fall" ? { y: Number(e.y) - (1 - progress) ** 2 * 150 } : {}),
			};
		});
}
/** Desktop editors cannot erase objects they deliberately never received visually. */
export function preserveShadows(edited: readonly BoardElement[], saved: readonly BoardElement[]) {
	const ids = new Set(edited.map((e) => e.id));
	const hidden = shadowIds(saved);
	return [...saved.filter((e) => hidden.has(e.id) && !ids.has(e.id)), ...edited];
}
