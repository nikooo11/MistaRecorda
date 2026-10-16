import type { BoardElement } from "../../types/board";

/**
 * Excalidraw only selects objects that sit completely inside the selection box.
 * On the board a box that merely touches a drawing selects it, so this module
 * works out which objects the box touches and merges them into the selection.
 */
export interface Box {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}
type Point = [number, number];
export interface SelectionView {
	selectedElementIds: Readonly<Record<string, boolean>>;
	selectedGroupIds?: Readonly<Record<string, boolean>>;
	editingGroupId?: string | null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const LINEAR = new Set(["line", "arrow", "freedraw"]);
const SOLID = new Set(["text", "image", "embeddable", "iframe"]);
// Frames contain other objects; touching one while selecting its contents must not grab it.
const CONTAIN_ONLY = new Set(["frame", "magicframe", "selection"]);

export function selectionBox(element: Record<string, unknown>): Box {
	const x = num(element.x),
		y = num(element.y),
		w = num(element.width),
		h = num(element.height);
	return {
		x1: Math.min(x, x + w),
		y1: Math.min(y, y + h),
		x2: Math.max(x, x + w),
		y2: Math.max(y, y + h),
	};
}

const inside = (p: Point, b: Box) => p[0] >= b.x1 && p[0] <= b.x2 && p[1] >= b.y1 && p[1] <= b.y2;

/** Liang-Barsky clip: does the segment cross the box at all? */
export function segmentTouchesBox(a: Point, b: Point, box: Box) {
	const dx = b[0] - a[0],
		dy = b[1] - a[1];
	let t0 = 0,
		t1 = 1;
	const edges: [number, number][] = [
		[-dx, a[0] - box.x1],
		[dx, box.x2 - a[0]],
		[-dy, a[1] - box.y1],
		[dy, box.y2 - a[1]],
	];
	for (const [p, q] of edges) {
		if (p === 0) {
			if (q < 0) return false;
			continue;
		}
		const t = q / p;
		if (p < 0) {
			if (t > t1) return false;
			if (t > t0) t0 = t;
		} else {
			if (t < t0) return false;
			if (t < t1) t1 = t;
		}
	}
	return true;
}

function pointInPolygon(p: Point, polygon: readonly Point[]) {
	let hit = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [xi, yi] = polygon[i],
			[xj, yj] = polygon[j];
		if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)
			hit = !hit;
	}
	return hit;
}

function rotate(points: Point[], cx: number, cy: number, angle: number): Point[] {
	if (!angle) return points;
	const cos = Math.cos(angle),
		sin = Math.sin(angle);
	return points.map(([x, y]) => [
		cx + (x - cx) * cos - (y - cy) * sin,
		cy + (x - cx) * sin + (y - cy) * cos,
	]);
}

/** The element's outline in scene coordinates, plus whether its inside counts as part of it. */
function outline(e: BoardElement): { points: Point[]; closed: boolean; filled: boolean } {
	const x = num(e.x),
		y = num(e.y),
		angle = num(e.angle);
	const background = typeof e.backgroundColor === "string" ? e.backgroundColor : "transparent";
	const painted = background !== "transparent" && background !== "";
	if (LINEAR.has(e.type) && Array.isArray(e.points) && e.points.length > 0) {
		const points = (e.points as unknown[])
			.filter((p): p is number[] => Array.isArray(p))
			.map((p): Point => [x + num(p[0]), y + num(p[1])]);
		const xs = points.map((p) => p[0]),
			ys = points.map((p) => p[1]);
		const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
			cy = (Math.min(...ys) + Math.max(...ys)) / 2;
		const first = points[0],
			last = points[points.length - 1];
		const closed =
			e.polygon === true ||
			(points.length > 2 && first[0] === last[0] && first[1] === last[1]);
		return { points: rotate(points, cx, cy, angle), closed, filled: closed && painted };
	}
	const w = num(e.width),
		h = num(e.height),
		cx = x + w / 2,
		cy = y + h / 2;
	let points: Point[];
	if (e.type === "diamond")
		points = [
			[cx, y],
			[x + w, cy],
			[cx, y + h],
			[x, cy],
		];
	else if (e.type === "ellipse")
		points = Array.from({ length: 32 }, (_, i): Point => {
			const t = (i / 32) * Math.PI * 2;
			return [cx + (Math.cos(t) * w) / 2, cy + (Math.sin(t) * h) / 2];
		});
	else
		points = [
			[x, y],
			[x + w, y],
			[x + w, y + h],
			[x, y + h],
		];
	return {
		points: rotate(points, cx, cy, angle),
		closed: true,
		filled: painted || SOLID.has(e.type),
	};
}

/** True when the box overlaps any visible part of the element (rotation-aware). */
export function touchesBox(e: BoardElement, box: Box) {
	const { points, closed, filled } = outline(e);
	if (!points.length) return false;
	// Strokes are drawn with width, so a box grazing the ink still touches it.
	const pad = Math.max(1, num(e.strokeWidth) / 2);
	const grown = { x1: box.x1 - pad, y1: box.y1 - pad, x2: box.x2 + pad, y2: box.y2 + pad };
	if (points.some((p) => inside(p, grown))) return true;
	const segments = closed ? points.length : points.length - 1;
	for (let i = 0; i < segments; i++)
		if (segmentTouchesBox(points[i], points[(i + 1) % points.length], grown)) return true;
	// A box drawn entirely inside a filled shape touches it; inside a hollow outline it does not.
	return filled && points.length > 2 && pointInPolygon([box.x1, box.y1], points);
}

export function canTouchSelect(e: BoardElement) {
	return (
		!e.isDeleted &&
		e.locked !== true &&
		!CONTAIN_ONLY.has(e.type) &&
		// Bound labels are selected through their container, as Excalidraw does.
		typeof e.containerId !== "string"
	);
}

const groupIdsOf = (e: BoardElement): string[] =>
	Array.isArray(e.groupIds)
		? e.groupIds.filter((id): id is string => typeof id === "string")
		: [];

/** The group Excalidraw selects for an element: the outermost one, or the next level inside an edited group. */
function selectableGroup(e: BoardElement, editingGroupId?: string | null) {
	const groups = groupIdsOf(e);
	if (!editingGroupId) return groups[groups.length - 1];
	const at = groups.indexOf(editingGroupId);
	return at > 0 ? groups[at - 1] : at === 0 ? undefined : groups[groups.length - 1];
}

/**
 * The selection after adding every object the box touches, with whole groups selected.
 * Returns undefined when the touched objects are already selected, so callers can skip
 * redundant scene updates.
 */
export function touchSelection(
	elements: readonly BoardElement[],
	box: Box,
	view: SelectionView,
): Pick<SelectionView, "selectedElementIds" | "selectedGroupIds"> | undefined {
	const live = elements.filter((e) => !e.isDeleted);
	const touched = live.filter((e) => canTouchSelect(e) && touchesBox(e, box));
	const selectedElementIds: Record<string, boolean> = { ...view.selectedElementIds };
	const selectedGroupIds: Record<string, boolean> = { ...view.selectedGroupIds };
	let changed = false;
	const add = (id: string) => {
		if (selectedElementIds[id]) return;
		selectedElementIds[id] = true;
		changed = true;
	};
	for (const e of touched) {
		add(e.id);
		const group = selectableGroup(e, view.editingGroupId);
		if (!group) continue;
		if (!selectedGroupIds[group]) {
			selectedGroupIds[group] = true;
			changed = true;
		}
		for (const member of live)
			if (canTouchSelect(member) && groupIdsOf(member).includes(group)) add(member.id);
	}
	return changed ? { selectedElementIds, selectedGroupIds } : undefined;
}
