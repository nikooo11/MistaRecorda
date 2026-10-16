import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { SpeakerHighIcon } from "@phosphor-icons/react";
import type { MemeAsset } from "../../types/memes";

/** Hover previews are silent; only the normal placement action can trigger audio. */
export function MemePreviewButton({
	asset,
	soundName,
	onClick,
	disabled = false,
	onDragPreview,
	onDrop,
}: {
	asset: MemeAsset;
	soundName?: string;
	onClick: () => void;
	disabled?: boolean;
	onDragPreview?: (point: { x: number; y: number }) => void;
	onDrop?: (point: { x: number; y: number }) => void;
}) {
	const drag = useRef<{ id: number; x: number; y: number; moved: boolean }>();
	const suppressClick = useRef(false);
	const [anchor, setAnchor] = useState<{ x: number; y: number }>();
	const show = (target: HTMLElement) => {
		const rect = target.getBoundingClientRect();
		setAnchor({
			x: Math.max(8, Math.min(window.innerWidth - 256, rect.right + 8)),
			y: Math.max(8, Math.min(window.innerHeight - 246, rect.top)),
		});
	};
	const audioLabel = asset.soundId
		? `Contains audio${soundName ? ` · ${soundName}` : ""}`
		: "No audio";
	return (
		<>
			<button
				className="meme-preview-button"
				aria-label={`Place ${asset.name}${asset.soundId ? " · Contains audio" : ""}`}
				disabled={disabled}
				onPointerDownCapture={(e) => {
					if (!onDragPreview || e.button !== 0) return;
					e.stopPropagation();
					drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
					suppressClick.current = false;
					e.currentTarget.setPointerCapture(e.pointerId);
				}}
				onPointerMoveCapture={(e) => {
					e.stopPropagation();
					const d = drag.current;
					if (!d || d.id !== e.pointerId) return;
					if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true;
					if (d.moved) {
						e.preventDefault();
						setAnchor(undefined);
						onDragPreview?.({ x: e.clientX, y: e.clientY });
					}
				}}
				onPointerUpCapture={(e) => {
					e.stopPropagation();
					const d = drag.current;
					drag.current = undefined;
					if (d?.moved) {
						suppressClick.current = true;
						e.preventDefault();
						onDrop?.({ x: e.clientX, y: e.clientY });
					}
				}}
				onPointerCancelCapture={() => {
					drag.current = undefined;
				}}
				onContextMenu={(e) => e.preventDefault()}
				style={onDragPreview ? { touchAction: "none" } : undefined}
				onClick={() => {
					if (suppressClick.current) {
						suppressClick.current = false;
						return;
					}
					setAnchor(undefined);
					onClick();
				}}
				onMouseEnter={(e) => show(e.currentTarget)}
				onMouseLeave={() => setAnchor(undefined)}
				onFocus={(e) => show(e.currentTarget)}
				onBlur={() => setAnchor(undefined)}
			>
				<span className="meme-thumbnail">
					<img src={asset.dataURL} alt="" loading="lazy" draggable={false} />
					{asset.soundId && (
						<span className="meme-audio-badge" aria-label="Contains audio">
							<SpeakerHighIcon size={15} />
						</span>
					)}
				</span>
				<span>{asset.name}</span>
			</button>
			{anchor &&
				createPortal(
					<aside
						className="meme-hover-preview"
						role="tooltip"
						style={{ left: anchor.x, top: anchor.y }}
					>
						<img src={asset.dataURL} alt={`${asset.name} preview`} />
						<strong>{asset.name}</strong>
						<small>
							{asset.soundId && <SpeakerHighIcon size={15} />} {audioLabel}
						</small>
					</aside>,
					document.body,
				)}
		</>
	);
}
