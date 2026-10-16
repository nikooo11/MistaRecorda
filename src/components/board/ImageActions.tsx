import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type { BoardElement, BoardScene } from "../../types/board";
import { chartMeta } from "./charts/chartModel";
import { exitingImages, type ImageAction, type ImageExit } from "./imageRemoval";
import { presentationMeta } from "./shadowObjects";

type View = { x: number; y: number; zoom: number };
function position(e: BoardElement, view: View) {
	return {
		left: (Number(e.x) + view.x) * view.zoom,
		top: (Number(e.y) + view.y) * view.zoom,
		width: Number(e.width) * view.zoom,
		height: Number(e.height) * view.zoom,
		transform: `rotate(${Number(e.angle || 0)}rad)`,
	};
}
export function ImageOutros({
	scene,
	view,
	tablet,
}: {
	scene: BoardScene;
	view: View;
	tablet: boolean;
}) {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		setNow(Date.now());
		if (!exitingImages(scene.elements, tablet, Date.now()).length) return;
		const timer = setInterval(() => setNow(Date.now()), 30);
		const end = setTimeout(() => clearInterval(timer), 500);
		return () => {
			clearInterval(timer);
			clearTimeout(end);
		};
	}, [scene.elements, tablet]);
	return (
		<>
			{exitingImages(scene.elements, tablet, now).map((e) => {
				const meta = presentationMeta(e)!;
				const progress = Math.min(1, Math.max(0, (now - meta.removedAt!) / 450));
				return (
					<div key={e.id} className="image-outro" style={position(e, view)}>
						<img
							alt=""
							src={scene.files[String(e.fileId)]?.dataURL}
							draggable={false}
							style={{
								opacity:
									((meta.shadow ? 50 : Number(e.opacity ?? 100)) / 100) *
									(1 - progress),
								transform:
									meta.exit === "fall"
										? `translateY(${progress * progress * 150}px)`
										: meta.exit === "spin" || !meta.exit
											? `rotate(${progress * 360}deg) scale(${1 - progress})`
											: undefined,
							}}
						/>
					</div>
				);
			})}
		</>
	);
}
export function ImageActions({
	elements,
	view,
	canPaste,
	connected,
	onAction,
	onMove,
	onExit,
}: {
	elements: BoardElement[];
	view: View;
	canPaste: boolean;
	connected: boolean;
	onAction: (action: ImageAction, id: string) => Promise<void>;
	onMove: (id: string, dx: number, dy: number) => Promise<void>;
	onExit: (id: string, exit: ImageExit) => Promise<void>;
}) {
	const [selected, select] = useState<string>();
	const [menu, showMenu] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const hold = useRef<ReturnType<typeof setTimeout>>();
	const gesture = useRef<{
		id: number;
		x: number;
		y: number;
		repeat: boolean;
		moved: boolean;
		held: boolean;
	}>();
	const root = useRef<HTMLDivElement>(null);
	const menuRoot = useRef<HTMLDivElement>(null);
	const images = elements.filter(
		(e) => e.type === "image" && !e.isDeleted && !e.locked && !chartMeta(e),
	);
	const image = images.find((e) => e.id === selected);
	useEffect(() => {
		const outside = (event: PointerEvent) => {
			if (
				root.current?.contains(event.target as Node) ||
				menuRoot.current?.contains(event.target as Node)
			)
				return;
			select(undefined);
			showMenu(false);
		};
		document.addEventListener("pointerdown", outside, true);
		return () => {
			document.removeEventListener("pointerdown", outside, true);
			clearTimeout(hold.current);
		};
	}, []);
	async function run(work: () => Promise<void>) {
		if (busy) return;
		setBusy(true);
		setError("");
		try {
			await work();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}
	return (
		<div
			ref={root}
			className="pan-image-actions"
			onPointerDown={(e) => e.stopPropagation()}
			onPointerUp={(e) => e.stopPropagation()}
			onPointerMove={(e) => e.stopPropagation()}
		>
			{images.map((e) => (
				<button
					key={e.id}
					type="button"
					aria-label="Select placed image"
					aria-pressed={e.id === selected}
					className={`pan-image-hit ${e.id === selected ? "selected" : ""}`}
					style={{
						...position(e, view),
						...(e.id === selected ? { translate: `${offset.x}px ${offset.y}px` } : {}),
					}}
					onContextMenu={(event) => {
						event.preventDefault();
						select(e.id);
						showMenu(true);
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							select(e.id);
							showMenu(true);
						}
					}}
					onPointerDown={(event) => {
						if (busy || gesture.current) return;
						event.preventDefault();
						event.currentTarget.setPointerCapture(event.pointerId);
						gesture.current = {
							id: event.pointerId,
							x: event.clientX,
							y: event.clientY,
							repeat: selected === e.id,
							moved: false,
							held: false,
						};
						select(e.id);
						showMenu(false);
						hold.current = setTimeout(() => {
							if (gesture.current) {
								gesture.current.held = true;
								showMenu(true);
							}
						}, 550);
					}}
					onPointerMove={(event) => {
						const g = gesture.current;
						if (!g || g.id !== event.pointerId) return;
						const x = event.clientX - g.x,
							y = event.clientY - g.y;
						if (Math.hypot(x, y) > 8) {
							g.moved = true;
							clearTimeout(hold.current);
							showMenu(false);
						}
						if (g.moved) setOffset({ x, y });
					}}
					onPointerUp={(event) => {
						const g = gesture.current;
						if (!g || g.id !== event.pointerId) return;
						clearTimeout(hold.current);
						gesture.current = undefined;
						if (g.moved && connected)
							void run(() =>
								onMove(
									e.id,
									(event.clientX - g.x) / view.zoom,
									(event.clientY - g.y) / view.zoom,
								),
							);
						else if (!g.moved && (g.repeat || g.held)) showMenu(true);
						setOffset({ x: 0, y: 0 });
					}}
					onPointerCancel={() => {
						clearTimeout(hold.current);
						gesture.current = undefined;
						setOffset({ x: 0, y: 0 });
					}}
				/>
			))}
			{(image || canPaste) &&
				createPortal(
					<div
						ref={menuRoot}
						className="pan-image-menu"
						role="group"
						aria-label="Placed image controls"
					>
						{!image ? (
							<button
								disabled={busy || !connected}
								onClick={() => void run(() => onAction("paste", ""))}
							>
								Paste copied image
							</button>
						) : !menu ? (
							<button onClick={() => showMenu(true)}>
								Image options · tap again or hold
							</button>
						) : (
							<>
								{(
									[
										["duplicate", "Duplicate"],
										["copy", "Copy"],
										["paste", "Paste"],
										["remove", "Remove from screen"],
										["delete", "Delete"],
									] as const
								).map(([action, label]) => (
									<button
										key={action}
										disabled={
											busy ||
											(action !== "copy" && !connected) ||
											(action === "paste" && !canPaste)
										}
										title={
											action === "remove"
												? "Play the exit transition, then remove this image."
												: action === "delete"
													? "Delete this placed image immediately. The library copy stays available."
													: undefined
										}
										onClick={() =>
											void run(async () => {
												await onAction(action, image.id);
												if (action === "delete" || action === "remove")
													select(undefined);
											})
										}
									>
										{label}
									</button>
								))}
								<label>
									Exit{" "}
									<select
										aria-label="Image exit transition"
										disabled={busy || !connected}
										value={presentationMeta(image)?.exit ?? "spin"}
										onChange={(event) =>
											void run(() =>
												onExit(image.id, event.target.value as ImageExit),
											)
										}
									>
										<option value="none">None</option>
										<option value="fade">Fade out</option>
										<option value="spin">Spin out</option>
										<option value="fall">Fall out</option>
									</select>
								</label>
								<button
									onClick={() => {
										select(undefined);
										showMenu(false);
									}}
								>
									Done
								</button>
							</>
						)}
						{error && <span role="alert">{error}</span>}
					</div>,
					document.body,
				)}
		</div>
	);
}
