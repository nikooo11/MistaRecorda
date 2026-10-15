import type { ChartPlayback } from "../../../types/charts";

/** Deterministic logical clock: every surface computes the same reveal from the same
 * anchor, so the iPad, Mac overlay and recording agree after scrubs and reconnects. */
export function revealAt(p: ChartPlayback | undefined, now: number, steps: number): number {
	if (!p) return 0;
	const clamp = (v: number) => Math.max(0, Math.min(steps, v));
	const from = clamp(p.position),
		to = clamp(p.target);
	if (from === to) return to;
	const moved = Math.max(0, now - p.anchorAt) / Math.max(1, p.msPerStep);
	return from < to ? Math.min(to, from + moved) : Math.max(to, from - moved);
}
export const isPlaying = (p: ChartPlayback | undefined, now: number, steps: number) =>
	!!p && revealAt(p, now, steps) !== Math.max(0, Math.min(steps, p.target));

export type PlaybackCommand =
	| { action: "play" }
	| { action: "pause" }
	| { action: "next" }
	| { action: "previous" }
	| { action: "reset" }
	| { action: "showAll" }
	| { action: "seek"; position: number };

/** Every command re-anchors at the current position, so pausing or scrubbing never jumps. */
export function applyPlayback(
	p: ChartPlayback,
	command: PlaybackCommand,
	steps: number,
	msPerStep: number,
	now: number,
	animate = true,
): ChartPlayback {
	const current = revealAt(p, now, steps);
	const base = { ...p, anchorAt: now, msPerStep, seq: p.seq + 1, position: current };
	const eps = 1e-6;
	switch (command.action) {
		case "play":
			return { ...base, position: current >= steps - eps ? 0 : current, target: steps };
		case "pause":
			return { ...base, target: current };
		case "next": {
			// Rapid taps queue steps: count from where the current animation is heading.
			// During Play (heading more than a step away), Next instead stops at the next step.
			const heading = Math.max(0, Math.min(steps, p.target));
			const from = heading > current && heading - current <= 1 + eps ? heading : current;
			const target = Math.min(steps, Math.floor(from + eps) + 1);
			return animate ? { ...base, target } : { ...base, position: target, target };
		}
		case "previous": {
			const target = Math.max(0, Math.ceil(current - eps) - 1);
			return { ...base, position: target, target };
		}
		case "reset":
			return { ...base, position: 0, target: 0 };
		case "showAll":
			return { ...base, position: steps, target: steps };
		case "seek": {
			const position = Math.max(0, Math.min(steps, command.position));
			return { ...base, position, target: position };
		}
	}
}
export const initialPlayback = (chartId: string, now: number): ChartPlayback => ({
	chartId,
	position: 0,
	target: 0,
	anchorAt: now,
	msPerStep: 1200,
	seq: 0,
});
/** Out-of-order events are ignored; a reconnect snapshot replaces older local state. */
export function acceptPlayback(
	current: Record<string, ChartPlayback>,
	incoming: ChartPlayback,
): Record<string, ChartPlayback> {
	const old = current[incoming.chartId];
	if (old && old.seq >= incoming.seq) return current;
	return { ...current, [incoming.chartId]: incoming };
}
/** A non-animated chart snaps between whole steps, even mid-transition. */
export const renderedReveal = (reveal: number, animate: boolean) =>
	animate ? reveal : Math.floor(reveal + 1e-6);
