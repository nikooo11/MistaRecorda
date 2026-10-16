import { useEffect, useRef } from "react";
import { dragObject, normalizeTilt, type ObjectRect } from "./objectPlacement";
export function ObjectDraft({
	src,
	name,
	rect,
	zoom,
	left,
	top,
	onChange,
	onDeploy,
	onCancel,
	busy,
	connected = true,
}: {
	src: string;
	name: string;
	rect: ObjectRect;
	zoom: number;
	left: number;
	top: number;
	onChange: (rect: ObjectRect) => void;
	onDeploy: () => void;
	onCancel: () => void;
	busy: boolean;
	connected?: boolean;
}) {
	const preview = useRef<HTMLDivElement>(null);
	const controls = useRef<HTMLDivElement>(null);
	useEffect(() => {
		// Dismiss locally: disconnected companions must never trap a private draft.
		const outside = (event: PointerEvent) => {
			if (
				busy ||
				event.button !== 0 ||
				!(event.target instanceof Node) ||
				preview.current?.contains(event.target) ||
				controls.current?.contains(event.target)
			)
				return;
			onCancel();
			// The dismissing tap must not also draw a stroke on the canvas.
			if (
				event.target instanceof HTMLCanvasElement ||
				(event.target instanceof HTMLElement &&
					event.target.classList.contains("board-stage"))
			) {
				event.preventDefault();
				event.stopPropagation();
			}
		};
		const onEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !busy) {
				event.preventDefault();
				event.stopPropagation();
				onCancel();
			}
		};
		document.addEventListener("pointerdown", outside, true);
		document.addEventListener("keydown", onEscape, true);
		return () => {
			document.removeEventListener("pointerdown", outside, true);
			document.removeEventListener("keydown", onEscape, true);
		};
	}, [busy, onCancel]);
	const gesture = useRef<{
		id: number;
		x: number;
		y: number;
		rect: ObjectRect;
		corner?: string;
		center: { x: number; y: number };
	}>();
	return (
		<>
			<div
				ref={preview}
				className="object-draft"
				aria-label={`Private preview of ${name}`}
				style={{
					left,
					top,
					width: rect.width * zoom,
					height: rect.height * zoom,
					transform: `rotate(${rect.angle ?? 0}rad)`,
				}}
				onPointerDown={(e) => {
					if (e.button !== 0 || busy) return;
					e.preventDefault();
					e.stopPropagation();
					const bounds = e.currentTarget.getBoundingClientRect();
					gesture.current = {
						id: e.pointerId,
						x: e.clientX,
						y: e.clientY,
						rect,
						corner: (e.target as HTMLElement).dataset.corner,
						center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
					};
					e.currentTarget.setPointerCapture(e.pointerId);
				}}
				onPointerMove={(e) => {
					const g = gesture.current;
					if (!g || g.id !== e.pointerId) return;
					e.stopPropagation();
					onChange(
						g.corner === "rotate"
							? {
									...g.rect,
									angle: normalizeTilt(
										(g.rect.angle ?? 0) +
											Math.atan2(
												e.clientY - g.center.y,
												e.clientX - g.center.x,
											) -
											Math.atan2(g.y - g.center.y, g.x - g.center.x),
									),
								}
							: dragObject(g.rect, e.clientX - g.x, e.clientY - g.y, zoom, g.corner),
					);
				}}
				onPointerUp={(e) => {
					gesture.current = undefined;
					if (e.currentTarget.hasPointerCapture(e.pointerId))
						e.currentTarget.releasePointerCapture(e.pointerId);
				}}
				onPointerCancel={() => {
					gesture.current = undefined;
				}}
				onLostPointerCapture={() => {
					gesture.current = undefined;
				}}
				onContextMenu={(e) => e.preventDefault()}
			>
				<img src={src} alt="" draggable={false} />
				{["nw", "n", "ne", "e", "sw", "s", "se", "w", "rotate"].map((c) => (
					<button
						key={c}
						data-corner={c}
						className={`draft-handle ${c}`}
						aria-label={c === "rotate" ? `Tilt ${name}` : `Resize ${name} ${c}`}
					>
						{c === "rotate" ? "↻" : null}
					</button>
				))}
			</div>
			<div
				ref={controls}
				className="object-deploy-bar"
				role="group"
				aria-label="Placement controls"
			>
				<span>
					<strong>Private preview</strong>
					<small>Drag to move · edges resize · tap outside to cancel</small>
					{!connected && <small>Reconnect to deploy. Adjust or cancel anytime.</small>}
				</span>
				<label className="draft-tilt">
					Tilt {Math.round(((rect.angle ?? 0) * 180) / Math.PI)}°
					<input
						aria-label="Tilt"
						type="range"
						min="-180"
						max="180"
						step="1"
						value={Math.round(((rect.angle ?? 0) * 180) / Math.PI)}
						disabled={busy}
						onChange={(e) =>
							onChange({ ...rect, angle: (Number(e.target.value) * Math.PI) / 180 })
						}
					/>
				</label>
				<button disabled={busy} onClick={onCancel}>
					Cancel
				</button>
				<button className="deploy" disabled={busy || !connected} onClick={onDeploy}>
					{busy ? "Deploying…" : "Deploy"}
				</button>
			</div>
		</>
	);
}
