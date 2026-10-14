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
	useEffect(() => {
		void window.electronAPI.studio.request("info").then(setInfo);
		return window.electronAPI.studio.onChanged(setInfo);
	}, []);
	const enabled = info?.camera?.enabled && info?.camera?.preview;
	const deviceId = info?.camera?.deviceId;
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
			data-locked={layout.locked}
			title={
				layout.locked
					? "Camera position locked. Unlock in Layers."
					: "Drag to move your camera in the recording. Resize in Layers."
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
			{error && <span className="camera-error">{error}</span>}
			<button
				className="camera-layout-button"
				aria-label="Camera layer settings"
				title="Choose camera size, shape, position, and lock movement."
				onClick={() => void window.electronAPI.studio.request("open", "layers")}
			>
				⋮
			</button>
		</main>
	);
}
