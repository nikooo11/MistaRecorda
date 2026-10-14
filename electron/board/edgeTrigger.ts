/** Reveal a handle near the edge; opening the board always requires a click. */
export class EdgeBoardTrigger {
	private lastNearEdge = -Infinity;
	update(nearEdge: boolean, enabled: boolean, now: number): boolean {
		if (!enabled) {
			this.lastNearEdge = -Infinity;
			return false;
		}
		if (nearEdge) this.lastNearEdge = now;
		return now - this.lastNearEdge < 700;
	}
}
