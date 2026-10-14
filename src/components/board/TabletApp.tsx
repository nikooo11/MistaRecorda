import { useEffect, useMemo, useRef, useState } from "react";
import { BoardCanvas } from "./BoardCanvas";
import { companionTransport } from "./transport";
import type { BoardState } from "../../types/board";
export function TabletApp() {
	const [connection, setConnection] = useState("Connecting…");
	const transport = useMemo(() => companionTransport(setConnection), []);
	const [state, setState] = useState<BoardState>();
	const [streamError, setStreamError] = useState("");
	const [streamed, setStreamed] = useState(false);
	const [fallbackFrame, setFallbackFrame] = useState("");
	const fallbackTimer = useRef<ReturnType<typeof setTimeout>>();
	const video = useRef<HTMLVideoElement>(null);
	const peer = useRef<RTCPeerConnection>();
	const candidates = useRef<RTCIceCandidateInit[]>([]);
	useEffect(() => {
		const info = transport.on<{ state: BoardState }>("info", (data) => {
			setState(data.state);
		});
		const off = transport.on<{
			type: string;
			sdp: string;
			candidate: RTCIceCandidateInit;
			message: string;
			dataURL: string;
		}>("signal", async (signal) => {
			try {
				if (signal.type === "frame") {
					setFallbackFrame(signal.dataURL);
					setStreamed(true);
					setStreamError("");
				} else if (signal.type === "offer") {
					setFallbackFrame("");
					clearTimeout(fallbackTimer.current);
					fallbackTimer.current = setTimeout(() => {
						if (peer.current?.connectionState !== "connected")
							void transport
								.request("signal", { type: "fallback" })
								.catch((e) => setStreamError(String(e)));
					}, 5000);
					peer.current?.close();
					const p = new RTCPeerConnection({ iceServers: [] });
					peer.current = p;
					p.ontrack = (e) => {
						if (video.current) {
							video.current.srcObject = e.streams[0];
							void video.current
								.play()
								.catch(() => setStreamError("Tap Start screen to play the stream"));
						}
					};
					p.onicecandidate = (e) => {
						if (e.candidate)
							void transport
								.request("signal", {
									type: "candidate",
									candidate: e.candidate.toJSON(),
								})
								.catch((e) => setStreamError(String(e)));
					};
					p.onconnectionstatechange = () => {
						if (p.connectionState === "failed")
							setStreamError(
								"Connection failed. Check local-network access and tap Start screen again.",
							);
					};
					await p.setRemoteDescription({ type: "offer", sdp: signal.sdp });
					for (const candidate of candidates.current.splice(0))
						await p.addIceCandidate(candidate);
					const answer = await p.createAnswer();
					await p.setLocalDescription(answer);
					await transport.request("signal", { type: "answer", sdp: answer.sdp });
					setStreamError("");
				} else if (signal.type === "candidate") {
					if (peer.current?.remoteDescription)
						await peer.current.addIceCandidate(signal.candidate);
					else candidates.current.push(signal.candidate);
				} else if (signal.type === "error") setStreamError(signal.message);
			} catch (e) {
				setStreamError(String(e));
			}
		});
		const disconnect = transport.on("disconnected", () => {
			peer.current?.close();
			clearTimeout(fallbackTimer.current);
			setFallbackFrame("");
			setStreamed(false);
		});
		return () => {
			info();
			off();
			disconnect();
			clearTimeout(fallbackTimer.current);
			peer.current?.close();
		};
	}, [transport]);
	return (
		<main className="companion-shell">
			<header className="companion-header">
				<strong>MistaRecorda</strong>
				<span>{connection}</span>
				<button onClick={() => void transport.request("reconnect")}>Reconnect</button>
				<button
					disabled={!state}
					onClick={() => {
						void transport
							.request("signal", { type: "request" })
							.catch((e) => setStreamError(String(e)));
						void video.current?.play().catch(() => {
							/* ontrack retries once the stream arrives. */
						});
					}}
				>
					Start screen
				</button>
			</header>
			{streamError && <p role="alert">{streamError}</p>}
			<div className="companion-main">
				{state ? (
					<BoardCanvas
						transport={transport}
						initial={state}
						tablet
						streamed={streamed}
						background={
							<>
								<video
									ref={video}
									autoPlay
									muted
									playsInline
									onPlaying={() => setStreamed(true)}
									style={{ display: fallbackFrame ? "none" : "block" }}
								/>
								{fallbackFrame && (
									<img src={fallbackFrame} alt="Live computer screen" />
								)}
							</>
						}
					/>
				) : (
					<p>
						Keep this page open and approve your iPad in the computer’s Drawing board
						panel.
					</p>
				)}
			</div>
		</main>
	);
}
