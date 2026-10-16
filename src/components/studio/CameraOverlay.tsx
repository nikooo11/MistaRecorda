import { useEffect, useRef, useState } from "react";
import type { StudioInfo } from "../../types/studio";
import { getSquircleSvgPath } from "../../lib/geometry/squircle";
import "./cameraOverlay.css";

export function CameraOverlay() {
	const [info, setInfo] = useState<StudioInfo>();
	const [error, setError] = useState("");
	const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
	useEffect(() => {
		const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
		window.addEventListener("resize", resize);
		return () => window.removeEventListener("resize", resize);
	}, []);
	const video = useRef<HTMLVideoElement>(null);
	const dragging = useRef(false);
	useEffect(() => {
		void window.electronAPI.studio.request("info").then(setInfo);
		return window.electronAPI.studio.onChanged(setInfo);
	}, []);
	const enabled = info?.camera?.enabled && info?.camera?.preview;
	const deviceId = info?.camera?.deviceId;
	useEffect(() => {
		if (!enabled) return;
		let disposed = false;
		let needed = false;
		let timer: ReturnType<typeof setTimeout>;
		const canvas = document.createElement("canvas");
		canvas.width = 360;
		canvas.height = 360;
		const tick = async () => {
			const element = video.current;
			let frame: string | undefined;
			if (needed && element && element.readyState >= 2) {
				const context = canvas.getContext("2d");
				const edge = Math.min(element.videoWidth, element.videoHeight);
				if (context && edge > 0) {
					context.drawImage(
						element,
						(element.videoWidth - edge) / 2,
						(element.videoHeight - edge) / 2,
						edge,
						edge,
						0,
						0,
						360,
						360,
					);
					frame = canvas.toDataURL("image/jpeg", 0.8);
				}
			}
			try {
				needed = await window.electronAPI.studio.request<boolean>(
					"cameraPreviewFrame",
					frame,
				);
			} catch {
				needed = false;
			}
			if (!disposed) timer = setTimeout(tick, needed ? 80 : 800);
		};
		void tick();
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, [enabled, deviceId]);
	useEffect(() => {
		let disposed = false;
		let stream: MediaStream | undefined;
		setError("");
		if (enabled)
			void navigator.mediaDevices
				.getUserMedia({
					video: {
						...(deviceId ? { deviceId: { exact: deviceId } } : {}),
						width: { ideal: 480 },
						height: { ideal: 480 },
						frameRate: { ideal: 30, max: 30 },
					},
					audio: false,
				})
				.then((value) => {
					if (disposed) {
						value.getTracks().forEach((t) => t.stop());
						return;
					}
					stream = value;
					if (video.current) {
						video.current.srcObject = value;
						void video.current.play().catch(() => undefined);
					}
					void window.electronAPI.studio.request("cameraError", "");
				})
				.catch((e) => {
					if (disposed) return;
					setError("Camera unavailable");
					void window.electronAPI.studio.request("cameraError", String(e));
				});
		return () => {
			disposed = true;
			stream?.getTracks().forEach((t) => t.stop());
		};
	}, [enabled, deviceId]);
	const layout = info?.settings.cameraLayout;
	if (!layout) return null;
	return (
		<main
			className="live-camera"
			onContextMenu={(e) => {
				e.preventDefault();
				void window.electronAPI.studio.request("cameraMenu");
			}}
			onPointerDown={(e) => {
				if (e.button !== 0 || layout.locked || (e.target as Element).closest("button"))
					return;
				e.preventDefault();
				e.currentTarget.setPointerCapture(e.pointerId);
				dragging.current = true;
				void window.electronAPI.studio.request("cameraDrag", "start");
			}}
			onPointerMove={() => {
				if (dragging.current) void window.electronAPI.studio.request("cameraDrag", "move");
			}}
			onPointerUp={() => {
				dragging.current = false;
				void window.electronAPI.studio.request("cameraDrag", "end");
			}}
			onLostPointerCapture={() => {
				dragging.current = false;
				void window.electronAPI.studio.request("cameraDrag", "end");
			}}
			data-locked={layout.locked}
			title={
				layout.locked
					? "Camera position locked. Unlock in Layers."
					: "Drag to move your camera in the recording. Right-click to hide. Resize in Layers."
			}
		>
			<video
				ref={video}
				autoPlay
				playsInline
				muted
				style={{
					transform: layout.mirror ? "scaleX(-1)" : undefined,
					clipPath: `path('${getSquircleSvgPath({ x: 0, y: 0, width: size.width, height: size.height, radius: layout.roundness })}')`,
				}}
			/>
			{(layout.borderWidth ?? 0) > 0 && (
				<svg
					aria-hidden="true"
					style={{
						position: "absolute",
						inset: 0,
						width: "100%",
						height: "100%",
						pointerEvents: "none",
						clipPath: `path('${getSquircleSvgPath({ x: 0, y: 0, width: size.width, height: size.height, radius: layout.roundness })}')`,
					}}
				>
					<path
						d={getSquircleSvgPath({
							x: 0,
							y: 0,
							width: size.width,
							height: size.height,
							radius: layout.roundness,
						})}
						fill="none"
						stroke={layout.borderColor ?? "#ffffff"}
						strokeWidth={
							(Math.min(size.width, size.height) * (layout.borderWidth ?? 0)) / 50
						}
					/>
				</svg>
			)}
			{error && <span className="camera-error">{error}</span>}
			<button
				className="camera-layout-button"
				aria-label="Facecam menu"
				title="Choose camera size, shape, position, and lock movement."
				onClick={() => void window.electronAPI.studio.request("cameraMenu")}
			>
				⋮
			</button>
		</main>
	);
}
