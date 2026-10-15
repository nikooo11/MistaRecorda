import { useState } from "react";
import { createPortal } from "react-dom";
import { SpeakerHighIcon } from "@phosphor-icons/react";
import type { MemeAsset } from "../../types/memes";

/** Hover previews are silent; only the normal placement action can trigger audio. */
export function MemePreviewButton({
	asset,
	soundName,
	onClick,
	disabled = false,
}: {
	asset: MemeAsset;
	soundName?: string;
	onClick: () => void;
	disabled?: boolean;
}) {
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
				onClick={() => {
					setAnchor(undefined);
					onClick();
				}}
				onMouseEnter={(e) => show(e.currentTarget)}
				onMouseLeave={() => setAnchor(undefined)}
				onFocus={(e) => show(e.currentTarget)}
				onBlur={() => setAnchor(undefined)}
			>
				<span className="meme-thumbnail">
					<img src={asset.dataURL} alt="" loading="lazy" />
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
