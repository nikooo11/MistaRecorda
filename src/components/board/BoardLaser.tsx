import { useEffect, useState } from "react";
import type { BoardAPI, BoardState } from "../../types/board";
export interface LaserPoint {
	x: number;
	y: number;
	mode: "screen" | "board";
	time?: number;
}
export function BoardLaser({ transport, state }: { transport: BoardAPI; state: BoardState }) {
	const [points, setPoints] = useState<LaserPoint[]>([]);
	useEffect(() => {
		const off = transport.on<LaserPoint>("laser", (point) =>
			setPoints((old) =>
				[
					...old.filter((p) => Date.now() - (p.time ?? 0) < 450 && p.mode === point.mode),
					{ ...point, time: Date.now() },
				].slice(-24),
			),
		);
		const reset = transport.on("sceneReset", () => setPoints([]));
		const timer = setInterval(
			() =>
				setPoints((old) =>
					old.length ? old.filter((p) => Date.now() - (p.time ?? 0) < 650) : old,
				),
			50,
		);
		return () => {
			off();
			reset();
			clearInterval(timer);
		};
	}, [transport]);
	const visible = points.filter((p) => p.mode === state.mode);
	const last = visible[visible.length - 1];
	const scene = state.scenes[state.mode];
	const pos = (p: LaserPoint) =>
		`${(p.x + scene.scrollX) * scene.zoom},${(p.y + scene.scrollY) * scene.zoom}`;
	if (!last || !state.enabled || state.output === "screen") return null;
	return (
		<svg
			className="board-laser"
			viewBox={`0 0 ${state.width} ${state.height}`}
			aria-hidden="true"
			style={{ opacity: Math.max(0, 1 - (Date.now() - (last.time ?? 0)) / 650) }}
		>
			<polyline
				points={visible.map(pos).join(" ")}
				fill="none"
				stroke="#ff3048"
				strokeWidth="5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle
				cx={(last.x + scene.scrollX) * scene.zoom}
				cy={(last.y + scene.scrollY) * scene.zoom}
				r="7"
				fill="#ff3048"
				stroke="white"
				strokeWidth="2"
			/>
		</svg>
	);
}
