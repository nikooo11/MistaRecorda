import { useEffect, useId, useRef, useState } from "react";
import type { StudioInfo, SceneMediaSource } from "../../types/studio";
import { getSquircleSvgPath } from "../../lib/geometry/squircle";
import { cameraRect } from "../../lib/cameraLayout";
import "./liveScenePreview.css";
import { transformSceneLayer } from "./sceneLayerTransform";

type Frame = { dataURL: string; cameraFrame: string; error: string };
export function LiveScenePreview({
	info,
	selected,
	onTransform,
}: {
	info?: StudioInfo;
	selected?: SceneMediaSource;
	onTransform?: (patch: Partial<SceneMediaSource>) => void;
}) {
	const clipId = useId();
	const [frame, setFrame] = useState<Frame>();
	const [size, setSize] = useState({ width: 1280, height: 720 });
	const [retry, setRetry] = useState(0);
	const [draft, setDraft] = useState<Partial<SceneMediaSource>>();
	const drag = useRef<{
		x: number;
		y: number;
		width: number;
		height: number;
		source: SceneMediaSource;
		resize: boolean;
	}>();
	const canvas = useRef<HTMLDivElement>(null);
	useEffect(() => {
		setFrame(undefined);
		let disposed = false;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			if (!document.hidden) {
				try {
					const next = await window.electronAPI.studio.request<Frame>("livePreview");
					if (!disposed) setFrame(next);
				} catch (e) {
					if (!disposed)
						setFrame({
							dataURL: "",
							cameraFrame: "",
							error: e instanceof Error ? e.message : String(e),
						});
				}
			}
			if (!disposed) timer = setTimeout(poll, 80);
		};
		if (info?.selectedSource) void poll();
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, [info?.selectedSource?.id, retry]);
	useEffect(() => {
		setDraft(undefined);
		drag.current = undefined;
	}, [selected?.id, info?.activeSceneId]);
	const layout = info?.settings.cameraLayout;
	const rect = layout ? cameraRect(layout, { x: 0, y: 0, ...size }) : undefined;
	const path =
		layout && rect
			? getSquircleSvgPath({
					x: 0,
					y: 0,
					width: rect.width,
					height: rect.height,
					radius: layout.roundness,
				})
			: "";
	const item = selected ? { ...selected, ...draft } : undefined;
	return (
		<div className="live-scene-preview">
			<div className="live-preview-stage">
				{frame?.dataURL ? (
					<div
						ref={canvas}
						className="live-preview-canvas"
						style={{
							aspectRatio: `${size.width} / ${size.height}`,
							width: `min(100%, ${(size.width / size.height) * 100}cqh)`,
						}}
					>
						<img
							className="live-preview-screen"
							src={frame.dataURL}
							alt={`Live capture of ${info?.selectedName}`}
							onLoad={(e) => {
								const im = e.currentTarget;
								setSize((old) =>
									old.width === im.naturalWidth && old.height === im.naturalHeight
										? old
										: { width: im.naturalWidth, height: im.naturalHeight },
								);
							}}
							draggable={false}
						/>
						{info?.camera?.enabled && layout && rect && (
							<svg
								className="live-preview-camera"
								viewBox={`0 0 ${rect.width} ${rect.height}`}
								style={{
									left: `${(rect.x / size.width) * 100}%`,
									top: `${(rect.y / size.height) * 100}%`,
									width: `${(rect.width / size.width) * 100}%`,
									height: `${(rect.height / size.height) * 100}%`,
									filter: layout.shadow
										? `drop-shadow(0 2px 4px #0008)`
										: undefined,
								}}
								aria-label="Facecam recording position"
							>
								<defs>
									<clipPath id={clipId}>
										<path d={path} />
									</clipPath>
								</defs>
								<g clipPath={`url(#${clipId})`}>
									<rect width="100%" height="100%" fill="#26333b" />
									{frame.cameraFrame ? (
										<image
											href={frame.cameraFrame}
											width="100%"
											height="100%"
											preserveAspectRatio="xMidYMid slice"
											transform={
												layout.mirror
													? `translate(${rect.width}, 0) scale(-1, 1)`
													: undefined
											}
										/>
									) : (
										<text
											x="50%"
											y="50%"
											textAnchor="middle"
											fill="white"
											fontSize={rect.width / 10}
										>
											{info.camera.error
												? "Camera unavailable"
												: "Starting camera…"}
										</text>
									)}
									<path
										d={path}
										fill="none"
										stroke={layout.borderColor ?? "#fff"}
										strokeWidth={(rect.width * (layout.borderWidth ?? 0)) / 50}
									/>
								</g>
							</svg>
						)}
						{item?.enabled && item.kind !== "audio" && !info?.recording && (
							<div
								className="live-preview-selection"
								style={{
									left: `${item.x * 100}%`,
									top: `${item.y * 100}%`,
									width: `${item.width * 100}%`,
									height: `${item.height * 100}%`,
								}}
								aria-label={`Position ${item.name}`}
								onPointerDown={(e) => {
									if (e.button !== 0 || !canvas.current || !selected) return;
									e.preventDefault();
									e.currentTarget.setPointerCapture(e.pointerId);
									const box = canvas.current.getBoundingClientRect();
									drag.current = {
										x: e.clientX,
										y: e.clientY,
										width: box.width,
										height: box.height,
										source: selected,
										resize: (e.target as Element).classList.contains(
											"live-resize-handle",
										),
									};
								}}
								onPointerMove={(e) => {
									const d = drag.current;
									if (!d) return;
									setDraft(transformSceneLayer(d, e.clientX, e.clientY));
								}}
								onPointerUp={(e) => {
									if (drag.current) {
										const patch = transformSceneLayer(
											drag.current,
											e.clientX,
											e.clientY,
										);
										onTransform?.(patch);
									}
									drag.current = undefined;
									e.currentTarget.releasePointerCapture(e.pointerId);
									setDraft(undefined);
								}}
								onPointerCancel={() => {
									drag.current = undefined;
									setDraft(undefined);
								}}
							>
								<span>{item.name}</span>
								<button
									className="live-resize-handle"
									aria-label={`Resize ${item.name}`}
									title="Drag to resize"
								/>
							</div>
						)}
					</div>
				) : (
					<div className="live-preview-status" role="status">
						<strong>
							{!info?.selectedSource
								? "Choose a screen or window"
								: frame?.error || "Starting live preview…"}
						</strong>
						{frame?.error && (
							<button onClick={() => setRetry(retry + 1)}>Retry preview</button>
						)}
					</div>
				)}
			</div>
			<div className="live-preview-footer">
				<span>
					<i data-live={Boolean(frame?.dataURL)} />
					{frame?.dataURL ? "Live preview" : "Preview"}
				</span>
				<span>
					{selected && !info?.recording
						? "Drag the outlined layer · drag its corner to resize"
						: info?.settings.showStudioInCapture
							? "App windows visible in display recordings"
							: "Screen, drawings & facecam · app controls hidden"}
				</span>
			</div>
		</div>
	);
}
