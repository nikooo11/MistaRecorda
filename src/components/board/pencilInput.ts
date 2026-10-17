/** Canvas-only palm rejection. Buttons remain usable and finger drawing resumes after the pen. */
export class PencilContact {
	private pen?: number;
	private until = 0;
	private palms = new Set<number>();
	down(type: string, id: number, now: number) {
		if (type === "pen") {
			this.pen = id;
			this.until = Infinity;
			return false;
		}
		if (type === "touch" && (this.pen !== undefined || now < this.until)) {
			this.palms.add(id);
			return true;
		}
		return false;
	}
	blocked(id: number) {
		return this.palms.has(id);
	}
	up(id: number, now: number) {
		const blocked = this.palms.delete(id);
		if (this.pen === id) {
			this.pen = undefined;
			this.until = now + 250;
		}
		return blocked;
	}
	reset() {
		this.pen = undefined;
		this.until = 0;
		this.palms.clear();
	}
}
export type PenSample = { clientX: number; clientY: number; pressure: number };
/** Excalidraw receives the final native event; insert only the intermediate samples first. */
export function intermediatePenSamples(
	event: PenSample & { getCoalescedEvents?: () => PenSample[] },
) {
	let samples: PenSample[] = [];
	try {
		samples = event.getCoalescedEvents?.() ?? [];
	} catch {
		return [];
	}
	return samples
		.slice(-128)
		.filter(
			(p, i, a) =>
				Number.isFinite(p.clientX) &&
				Number.isFinite(p.clientY) &&
				Number.isFinite(p.pressure) &&
				!(p.clientX === event.clientX && p.clientY === event.clientY) &&
				(!i || p.clientX !== a[i - 1].clientX || p.clientY !== a[i - 1].clientY),
		)
		.map((p) => ({ ...p, pressure: Math.max(0, Math.min(1, p.pressure)) }));
}
export function appendPenSamples(
	points: readonly (readonly number[])[],
	pressures: readonly number[],
	samples: PenSample[],
	view: {
		offsetLeft: number;
		offsetTop: number;
		scrollX: number;
		scrollY: number;
		zoom: { value: number };
	},
	origin: { x: number; y: number },
) {
	const next = points.map((p) => [p[0], p[1]] as [number, number]);
	const weights = next.map((_, i) => pressures[i] ?? 0.5);
	for (const p of samples) {
		const x = (p.clientX - view.offsetLeft) / view.zoom.value - view.scrollX - origin.x,
			y = (p.clientY - view.offsetTop) / view.zoom.value - view.scrollY - origin.y;
		const last = next[next.length - 1];
		if (last?.[0] === x && last?.[1] === y) continue;
		next.push([x, y]);
		weights.push(p.pressure);
	}
	return { points: next, pressures: weights };
}
