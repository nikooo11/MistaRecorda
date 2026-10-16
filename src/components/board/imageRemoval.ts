import type { BoardElement } from "../../types/board";
import type { MemeTransition } from "../../types/memes";
import { presentationMeta } from "./shadowObjects";

/** Save the deletion immediately; the outro is a short, read-only visual projection.
 * It cannot resurrect an image or depend on the initiating tablet staying connected. */
export function removeImage(
	element: BoardElement,
	animate: boolean,
	now = Date.now(),
): BoardElement {
	const old = presentationMeta(element);
	return {
		...element,
		isDeleted: true,
		version: element.version + 1,
		versionNonce: Math.floor(Math.random() * 2e9),
		updated: now,
		customData: {
			...(element.customData as object),
			presentation: {
				shadow: false,
				publicOpacity: Number(element.opacity ?? 100),
				enter: "none",
				...old,
				exit: old?.exit ?? "spin",
				removedAt: animate ? now : undefined,
			},
		},
	};
}
export function exitingImages(elements: readonly BoardElement[], tablet: boolean, now: number) {
	return elements.filter((e) => {
		const meta = presentationMeta(e);
		return (
			e.type === "image" &&
			e.isDeleted &&
			meta?.removedAt !== undefined &&
			meta.exit !== "none" &&
			(tablet || !meta.shadow) &&
			now >= meta.removedAt &&
			now < meta.removedAt + 450
		);
	});
}
export type ImageAction = "copy" | "paste" | "duplicate" | "remove" | "delete";
export type ImageExit = MemeTransition;
