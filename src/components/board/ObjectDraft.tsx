import { useRef } from "react";
import { dragObject, type ObjectRect } from "./objectPlacement";
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
}) {
	const gesture = useRef<{
		id: number;
		x: number;
		y: number;
		rect: ObjectRect;
		corner?: string;
	}>();
	return (
		<>
			<div
				className="object-draft"
				aria-label={`Private preview of ${name}`}
				style={{ left, top, width: rect.width * zoom, height: rect.height * zoom }}
				onPointerDown={(e) => {
					if (e.button !== 0 || busy) return;
					e.preventDefault();
					e.stopPropagation();
					gesture.current = {
						id: e.pointerId,
						x: e.clientX,
						y: e.clientY,
						rect,
						corner: (e.target as HTMLElement).dataset.corner,
					};
					e.currentTarget.setPointerCapture(e.pointerId);
				}}
				onPointerMove={(e) => {
					const g = gesture.current;
					if (!g || g.id !== e.pointerId) return;
					e.stopPropagation();
					onChange(dragObject(g.rect, e.clientX - g.x, e.clientY - g.y, zoom, g.corner));
				}}
				onPointerUp={(e) => {
					gesture.current = undefined;
					if (e.currentTarget.hasPointerCapture(e.pointerId))
						e.currentTarget.releasePointerCapture(e.pointerId);
				}}
				onPointerCancel={() => {
					gesture.current = undefined;
				}}
			>
				<img src={src} alt="" draggable={false} />
				{["nw", "ne", "sw", "se"].map((c) => (
					<button
						key={c}
						data-corner={c}
						className={`draft-handle ${c}`}
						aria-label={`Resize ${name} ${c}`}
					/>
				))}
			</div>
			<div className="object-deploy-bar" role="group" aria-label="Placement controls">
				<span>
					<strong>Private preview</strong>
					<small>Drag to move · drag a corner to resize</small>
				</span>
				<button disabled={busy} onClick={onCancel}>
					Cancel
				</button>
				<button className="deploy" disabled={busy} onClick={onDeploy}>
					{busy ? "Deploying…" : "Deploy"}
				</button>
			</div>
		</>
	);
}
