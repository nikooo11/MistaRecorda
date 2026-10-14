import type { BoardElement } from "../../types/board";
export const objectId = () =>
	Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) =>
		v.toString(16).padStart(2, "0"),
	).join("");
export function selectedObjects(elements: readonly BoardElement[], ids: Record<string, boolean>) {
	const included = new Set(Object.keys(ids).filter((id) => ids[id]));
	for (const e of elements)
		if (
			!e.isDeleted &&
			((typeof e.containerId === "string" && included.has(e.containerId)) ||
				(typeof e.frameId === "string" && included.has(e.frameId)))
		)
			included.add(e.id);
	return elements.filter((e) => !e.isDeleted && included.has(e.id));
}
export function duplicateObjects(elements: readonly BoardElement[], offset = 24): BoardElement[] {
	const ids = new Map(elements.map((e) => [e.id, objectId()]));
	const groups = new Map<string, string>();
	const group = (id: string) => {
		if (!groups.has(id)) groups.set(id, objectId());
		return groups.get(id)!;
	};
	return elements.map((source) => {
		const e = structuredClone(source);
		const remap = (id: unknown) => (typeof id === "string" ? (ids.get(id) ?? null) : null);
		for (const key of ["startBinding", "endBinding"]) {
			const binding = e[key] as { elementId: string } | null;
			e[key] =
				binding && ids.has(binding.elementId)
					? { ...binding, elementId: ids.get(binding.elementId) }
					: null;
		}
		return {
			...e,
			id: ids.get(e.id)!,
			x: Number(e.x) + offset,
			y: Number(e.y) + offset,
			version: 1,
			versionNonce: Math.floor(Math.random() * 2e9),
			updated: Date.now(),
			index: null,
			groupIds: ((e.groupIds ?? []) as string[]).map(group),
			containerId: remap(e.containerId),
			frameId: remap(e.frameId),
			boundElements: Array.isArray(e.boundElements)
				? e.boundElements
						.filter((b) => ids.has(b.id))
						.map((b) => ({ ...b, id: ids.get(b.id) }))
				: null,
		};
	});
}
export function groupObjects(
	elements: readonly BoardElement[],
	ids: Record<string, boolean>,
	ungroup = false,
): BoardElement[] {
	const selected = selectedObjects(elements, ids);
	const selectedIds = new Set(selected.map((e) => e.id));
	const groupId = objectId();
	const outerGroups = new Set(
		selected.map((e) => (e.groupIds as string[] | undefined)?.slice(-1)[0]).filter(Boolean),
	);
	return elements.map((e) =>
		selectedIds.has(e.id)
			? {
					...e,
					version: e.version + 1,
					versionNonce: Math.floor(Math.random() * 2e9),
					updated: Date.now(),
					groupIds: ungroup
						? ((e.groupIds ?? []) as string[]).filter((id) => !outerGroups.has(id))
						: [...((e.groupIds ?? []) as string[]), groupId],
				}
			: e,
	);
}
export function hitObject(elements: readonly BoardElement[], x: number, y: number) {
	return [...elements].reverse().find((e) => {
		if (e.isDeleted || e.locked) return false;
		const cx = Number(e.x) + Number(e.width) / 2,
			cy = Number(e.y) + Number(e.height) / 2,
			a = -Number(e.angle || 0);
		const dx = (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a),
			dy = (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a);
		return (
			Math.abs(dx) <= Math.abs(Number(e.width)) / 2 + 8 &&
			Math.abs(dy) <= Math.abs(Number(e.height)) / 2 + 8
		);
	});
}
