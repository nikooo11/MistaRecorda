import { useEffect, useRef, useState } from "react";
export function BoardCamera({ visible, deviceId }: { visible: boolean; deviceId?: string }) {
	const video = useRef<HTMLVideoElement>(null);
	const [error, setError] = useState("");
	useEffect(() => {
		let stream: MediaStream | undefined;
		let cancelled = false;
		setError("");
		if (visible)
			void navigator.mediaDevices
				.getUserMedia({
					video: deviceId ? { deviceId: { exact: deviceId } } : true,
					audio: false,
				})
				.then((s) => {
					if (cancelled) {
						s.getTracks().forEach((t) => t.stop());
						return;
					}
					stream = s;
					if (video.current) {
						video.current.srcObject = s;
						void video.current.play();
					}
					setError("");
				})
				.catch((e) => {
					setError(String(e));
					void window.electronAPI.board
						.request("cameraError", String(e))
						.catch((error) => console.error("Could not report camera error", error));
				});
		return () => {
			cancelled = true;
			stream?.getTracks().forEach((t) => t.stop());
		};
	}, [visible, deviceId]);
	return visible && !error ? (
		<video
			ref={video}
			autoPlay
			playsInline
			muted
			style={{
				position: "absolute",
				bottom: 24,
				right: 24,
				width: 200,
				height: 200,
				objectFit: "cover",
				borderRadius: "50%",
				border: "3px solid white",
				boxShadow: "0 4px 24px #0004",
			}}
		/>
	) : null;
}
