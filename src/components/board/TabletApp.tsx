import { useEffect, useMemo, useRef, useState } from "react";
import { BoardCanvas } from "./BoardCanvas";
import { companionTransport } from "./transport";
import type { BoardState } from "../../types/board";
import { PencilSimpleIcon, HandIcon } from "@phosphor-icons/react";
import { tabletSceneMode } from "./tabletInteraction";
export function TabletApp() {
	const [connection, setConnection] = useState("Connecting…");
	const transport = useMemo(() => companionTransport(setConnection), []);
	const [state, setState] = useState<BoardState>();
	const [drawing, setDrawing] = useState(false);
	const [streamError, setStreamError] = useState("");
	const [streamed, setStreamed] = useState(false);
	const [fallbackFrame, setFallbackFrame] = useState("");
	const fallbackTimer = useRef<ReturnType<typeof setTimeout>>();
	const video = useRef<HTMLVideoElement>(null);
	const peer = useRef<RTCPeerConnection>();
	const candidates = useRef<RTCIceCandidateInit[]>([]);
	const lastFrame = useRef(0);
	const fallbackRequested = useRef(false);
	const streamingRequested = useRef(false);
	useEffect(() => {
		const info = transport.on<{ state: BoardState }>("info", (data) => {
			setState(data.state);
		});
		const stateChange = transport.on<{ state: BoardState }>("state", ({ state }) => {
			setState(state);
			if (!state.enabled || state.output === "screen") setDrawing(false);
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
					lastFrame.current = Date.now();
					setFallbackFrame(signal.dataURL);
					setStreamed(true);
					setStreamError("");
				} else if (signal.type === "offer") {
					lastFrame.current = Date.now();
					setFallbackFrame("");
					clearTimeout(fallbackTimer.current);
					fallbackTimer.current = setTimeout(() => {
						if (peer.current?.connectionState !== "connected") {
							fallbackRequested.current = true;
							void transport
								.request("signal", { type: "fallback" })
								.catch((e) => setStreamError(String(e)));
						}
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
			streamingRequested.current = false;
			peer.current?.close();
			clearTimeout(fallbackTimer.current);
			setFallbackFrame("");
			setStreamed(false);
		});
		return () => {
			info();
			stateChange();
			off();
			disconnect();
			clearTimeout(fallbackTimer.current);
			peer.current?.close();
		};
	}, [transport]);
	const hasState = !!state;
	useEffect(() => {
		if (!hasState) return;
		const player = video.current;
		if (!player) return;
		let frame = 0;
		const tick = () => {
			lastFrame.current = Date.now();
			setStreamed(true);
			frame = player.requestVideoFrameCallback(tick);
		};
		if (player.requestVideoFrameCallback) frame = player.requestVideoFrameCallback(tick);
		const watchdog = setInterval(() => {
			if (!streamingRequested.current) return;
			const stale = Date.now() - lastFrame.current;
			if (stale > 3000 && !fallbackRequested.current) {
				fallbackRequested.current = true;
				void transport
					.request("signal", { type: "fallback" })
					.catch((e) => setStreamError(String(e)));
			}
			if (stale > 8000) {
				setStreamed(false);
				setFallbackFrame("");
				setStreamError("Screen preview paused. Tap Start screen to reconnect.");
			}
		}, 1000);
		return () => {
			clearInterval(watchdog);
			if (frame) player.cancelVideoFrameCallback(frame);
		};
	}, [hasState, transport]);
	return (
		<main className="companion-shell">
			<header className="companion-header">
				<strong>MistaRecorda</strong>
				<span>{connection}</span>
				<button
					className="companion-draw-toggle"
					aria-pressed={drawing}
					disabled={!state}
					title="Draw with your finger or Pencil. Turn off to pan and pinch the screen preview."
					onClick={() => {
						if (drawing) setDrawing(false);
						else
							void transport
								.request<BoardState>("annotate")
								.then((state) => {
									setState(state);
									setDrawing(true);
								})
								.catch((e) => setStreamError(String(e)));
					}}
				>
					{drawing ? <PencilSimpleIcon size={18} /> : <HandIcon size={18} />}{" "}
					{drawing ? "Draw" : "Pan & zoom"}
				</button>
				{state && (
					<span className="companion-mode">
						{tabletSceneMode(state) === "board" ? "Whiteboard" : "Mac screen"}
					</span>
				)}
				<button onClick={() => void transport.request("reconnect")}>Reconnect</button>
				<button
					disabled={!state}
					onClick={() => {
						streamingRequested.current = true;
						fallbackRequested.current = false;
						lastFrame.current = Date.now();
						setStreamError("");
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
						drawing={drawing}
						streamed={streamed}
						background={
							<>
								<video
									ref={video}
									autoPlay
									muted
									playsInline
									onPlaying={() => setStreamed(true)}
									style={{
										display: fallbackFrame ? "none" : "block",
										visibility: streamed ? "visible" : "hidden",
									}}
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
