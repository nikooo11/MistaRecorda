import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mergeScenePatch, type ScenePatch } from "./sceneSync";
import { WhiteboardTabs } from "./WhiteboardTabs";
import { whiteboardView } from "./whiteboards";
import { whiteboardTransport } from "./whiteboardTransport";
import { BoardCanvas } from "./BoardCanvas";
import { companionTransport } from "./transport";
import type { BoardState } from "../../types/board";
import { PencilSimpleIcon, HandIcon } from "@phosphor-icons/react";
import { tabletSceneMode } from "./tabletInteraction";
export function TabletApp() {
	const [connection, setConnection] = useState("Connecting…");
	const [connectionEpoch, setConnectionEpoch] = useState(0);
	const transport = useMemo(() => companionTransport(setConnection), []);
	const [state, setState] = useState<BoardState>();
	const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
	const selectedRef = useRef(selectedBoard);
	selectedRef.current = selectedBoard;
	const stateRef = useRef(state);
	stateRef.current = state;
	const canvasTransport = useMemo(
		() =>
			whiteboardTransport(
				transport,
				() => stateRef.current,
				() => selectedRef.current,
				() => {
					selectedRef.current = null;
					setSelectedBoard(null);
				},
			),
		[transport],
	);
	const canvasState = useMemo(
		() => (state ? whiteboardView(state, selectedBoard) : undefined),
		[state, selectedBoard],
	);
	const [drawing, setDrawing] = useState(false);
	const [streamError, setStreamError] = useState("");
	const [cleanPreview, setCleanPreview] = useState(false);
	const [streamed, setStreamed] = useState(false);
	const [fallbackFrame, setFallbackFrame] = useState("");
	const fallbackTimer = useRef<ReturnType<typeof setTimeout>>();
	const video = useRef<HTMLVideoElement>(null);
	const peer = useRef<RTCPeerConnection>();
	const candidates = useRef<RTCIceCandidateInit[]>([]);
	const lastFrame = useRef(0);
	const fallbackRequested = useRef(false);
	const streamingRequested = useRef(false);
	const startScreen = useCallback(() => {
		streamingRequested.current = true;
		fallbackRequested.current = false;
		lastFrame.current = Date.now();
		setStreamError("");
		void video.current?.play().catch(() => {
			/* ontrack retries after the stream arrives. */
		});
		void transport
			.request("signal", { type: "request" })
			.catch((e) => setStreamError(String(e)));
	}, [transport]);
	const hasState = !!state;
	useEffect(() => {
		if (connection !== "Connected") {
			streamingRequested.current = false;
			return;
		}
		if (!hasState || streamingRequested.current) return;
		setDrawing(false);
		startScreen();
	}, [connection, connectionEpoch, hasState, startScreen]);

	useEffect(() => {
		const connected = transport.on("connected", () => {
			streamingRequested.current = false;
			setDrawing(false);
			setConnectionEpoch((value) => value + 1);
		});
		const patch = transport.on<ScenePatch>("sceneUpdate", (update) =>
			setState((old) => (old ? mergeScenePatch(old, update) : old)),
		);
		const info = transport.on<{ state: BoardState }>("info", (data) => {
			setState(data.state);
		});
		const stateChange = transport.on<{ state: BoardState }>("state", ({ state }) => {
			setState(state);
			if (!selectedRef.current && (!state.enabled || state.output === "screen"))
				setDrawing(false);
		});
		const off = transport.on<{
			type: string;
			sdp: string;
			candidate: RTCIceCandidateInit;
			message: string;
			dataURL: string;
			clean?: boolean;
		}>("signal", async (signal) => {
			try {
				if (signal.type === "frame") {
					setCleanPreview(!!signal.clean);
					lastFrame.current = Date.now();
					setFallbackFrame(signal.dataURL);
					setStreamed(true);
					setStreamError("");
				} else if (signal.type === "offer") {
					setCleanPreview(false);
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
		const refreshPreview = transport.on("refreshPreview", () => {
			if (!streamingRequested.current) return;
			fallbackRequested.current = false;
			lastFrame.current = Date.now();
			void transport
				.request("signal", { type: "request" })
				.catch((e) => setStreamError(String(e)));
		});
		return () => {
			connected();
			refreshPreview();
			patch();
			info();
			stateChange();
			off();
			disconnect();
			clearTimeout(fallbackTimer.current);
			peer.current?.close();
		};
	}, [transport]);
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
	const [urlPresentation, setURLPresentation] = useState<{
		url: string;
		previousName: string;
	} | null>(null);
	useEffect(() => {
		let disposed = false;
		const poll = () =>
			void transport
				.request<{ url: string; previousName: string } | null>("urlPresentation")
				.then((value) => {
					if (!disposed) setURLPresentation(value);
				})
				.catch(() => {});
		const timer = setInterval(poll, 1000);
		return () => {
			disposed = true;
			clearInterval(timer);
		};
	}, [transport]);

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
						else if (selectedBoard) setDrawing(true);
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
						{tabletSceneMode(canvasState ?? state) === "board"
							? "Whiteboard"
							: "Mac screen"}
					</span>
				)}
				<button onClick={() => void transport.request("reconnect")}>Reconnect</button>
				<button disabled={!state} onClick={startScreen}>
					{streamed ? "Refresh screen" : "Start screen"}
				</button>
				{urlPresentation && (
					<button
						title={`Return to ${urlPresentation.previousName}; keep Chrome tab open`}
						onClick={() =>
							void transport
								.request("endURLPresentation")
								.then(() => setURLPresentation(null))
						}
					>
						Return to scene
					</button>
				)}
			</header>
			{streamError && <p role="alert">{streamError}</p>}
			<div className="companion-main">
				{state ? (
					<BoardCanvas
						connected={connection === "Connected"}
						transport={canvasTransport}
						viewedWhiteboardId={selectedBoard ?? undefined}
						initial={canvasState!}
						extraControls={(flush) => (
							<WhiteboardTabs
								state={state}
								selected={selectedBoard}
								onSelect={setSelectedBoard}
								transport={transport}
								flush={flush}
							/>
						)}
						tablet
						drawing={drawing}
						onEnableDrawing={async () => {
							if (selectedBoard) {
								setDrawing(true);
								return;
							}
							const next = await transport.request<BoardState>("annotate");
							setState(next);
							setDrawing(true);
						}}
						streamed={!selectedBoard && streamed && !cleanPreview}
						background={
							<>
								<video
									ref={video}
									autoPlay
									muted
									playsInline
									onPlaying={() => {
										setStreamed(true);
										setStreamError("");
									}}
									style={{
										display: fallbackFrame ? "none" : "block",
										visibility:
											streamed && !selectedBoard ? "visible" : "hidden",
									}}
								/>
								{fallbackFrame && !selectedBoard && (
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
