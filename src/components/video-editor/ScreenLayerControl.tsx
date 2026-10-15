import { useEffect, useRef } from "react";
import type { Padding } from "./types";
import { resizeScreenLayer, type ScreenRect, type ScreenResizeHandle } from "./screenLayerResize";
import "./screenLayer.css";

const handles: ScreenResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const names = {
	nw: "top left",
	n: "top",
	ne: "top right",
	e: "right",
	se: "bottom right",
	s: "bottom",
	sw: "bottom left",
	w: "left",
};

export function ScreenLayerControl({
	rect,
	padding,
	selected,
	onSelect,
	onDeselect,
	onPreview,
	onCommit,
}: {
	rect: ScreenRect;
	padding: Padding;
	selected: boolean;
	onSelect: () => void;
	onDeselect: () => void;
	onPreview: (padding: Padding | null) => void;
	onCommit: (padding: Padding) => void;
}) {
	const root = useRef<HTMLDivElement>(null);
	const drag = useRef<{
		pointer: number;
		x: number;
		y: number;
		cssScale: number;
		rect: ScreenRect;
		padding: Padding;
		next: Padding;
		handle: ScreenResizeHandle;
		stage: { width: number; height: number };
	} | null>(null);
	const cancel = () => {
		drag.current = null;
		onPreview(null);
	};
	useEffect(
		() => () => {
			if (drag.current) onPreview(null);
		},
		[onPreview],
	);
	return (
		<div ref={root} className="screen-layer-control">
			{selected && (
				<button
					className="screen-layer-dismiss"
					aria-label="Deselect screen recording"
					onClick={onDeselect}
				/>
			)}
			<div
				className={`screen-layer-bounds ${selected ? "is-selected" : ""}`}
				style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
			>
				<button
					className="screen-layer-select"
					aria-label="Select screen recording layer"
					aria-pressed={selected}
					onClick={onSelect}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							e.stopPropagation();
							cancel();
							onDeselect();
						}
					}}
				/>
				{selected && (
					<>
						<span className="screen-layer-label">
							Screen recording · Drag an edge to resize
						</span>
						{handles.map((handle) => (
							<button
								key={handle}
								type="button"
								className={`screen-layer-handle handle-${handle}`}
								aria-label={`Resize screen recording ${names[handle]}`}
								onPointerDown={(e) => {
									if (e.button !== 0 || !root.current) return;
									e.preventDefault();
									e.stopPropagation();
									e.currentTarget.focus();
									e.currentTarget.setPointerCapture(e.pointerId);
									drag.current = {
										pointer: e.pointerId,
										x: e.clientX,
										y: e.clientY,
										cssScale:
											root.current.getBoundingClientRect().width /
											root.current.clientWidth,
										rect,
										padding,
										next: padding,
										handle,
										stage: {
											width: root.current.clientWidth,
											height: root.current.clientHeight,
										},
									};
								}}
								onPointerMove={(e) => {
									const d = drag.current;
									if (!d || d.pointer !== e.pointerId) return;
									e.preventDefault();
									e.stopPropagation();
									d.next = resizeScreenLayer(
										d.padding,
										d.rect,
										d.stage,
										d.handle,
										(e.clientX - d.x) / d.cssScale,
										(e.clientY - d.y) / d.cssScale,
									);
									onPreview(d.next);
								}}
								onPointerUp={(e) => {
									const d = drag.current;
									if (!d || d.pointer !== e.pointerId) return;
									drag.current = null;
									onCommit(d.next);
									onPreview(null);
									e.currentTarget.releasePointerCapture(e.pointerId);
								}}
								onPointerCancel={cancel}
								onLostPointerCapture={() => {
									if (drag.current) cancel();
								}}
								onKeyDown={(e) => {
									if (e.key === "Escape") {
										e.stopPropagation();
										cancel();
										onDeselect();
									}
									if (
										[
											"ArrowLeft",
											"ArrowRight",
											"ArrowUp",
											"ArrowDown",
										].includes(e.key) &&
										root.current
									) {
										e.preventDefault();
										e.stopPropagation();
										const sign =
											e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 1;
										onCommit(
											resizeScreenLayer(
												padding,
												rect,
												{
													width: root.current.clientWidth,
													height: root.current.clientHeight,
												},
												"e",
												rect.width * sign * (e.shiftKey ? 0.025 : 0.005),
												0,
											),
										);
									}
								}}
							/>
						))}
					</>
				)}
			</div>
		</div>
	);
}
