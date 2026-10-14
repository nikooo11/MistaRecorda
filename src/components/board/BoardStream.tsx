import { useEffect } from "react";
import type { BoardAPI } from "../../types/board";
export function BoardStream({ transport }: { transport: BoardAPI }) {
	useEffect(() => {
		const peers = new Map<string, RTCPeerConnection>();
		const candidates = new Map<string, RTCIceCandidateInit[]>();
		const fallback = new Set<string>();
		let stream: MediaStream | undefined;
		let acquisition: Promise<MediaStream> | undefined;
		let disposed = false;
		let generation = 0;
		const video = document.createElement("video");
		video.muted = true;
		video.playsInline = true;
		const send = (deviceId: string, signal: unknown) =>
			transport.request("signalToDevice", { deviceId, signal });
		async function capture() {
			if (stream?.getVideoTracks()[0]?.readyState === "live") return stream;
			if (acquisition) return acquisition;
			const expectedGeneration = generation;
			acquisition = (async () => {
				const id = await transport.request<string>("captureSource");
				const captured = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: {
						mandatory: {
							chromeMediaSource: "desktop",
							chromeMediaSourceId: id,
							maxFrameRate: 30,
							maxWidth: 1920,
							maxHeight: 1080,
						},
					} as MediaTrackConstraints,
				});
				if (disposed || generation !== expectedGeneration) {
					captured.getTracks().forEach((t) => t.stop());
					throw Error("Sharing stopped");
				}
				stream = captured;
				video.srcObject = captured;
				await video.play();
				return captured;
			})().finally(() => {
				acquisition = undefined;
			});
			return acquisition;
		}
		function stop() {
			generation++;
			for (const peer of peers.values()) peer.close();
			peers.clear();
			candidates.clear();
			fallback.clear();
			stream?.getTracks().forEach((t) => t.stop());
			stream = undefined;
			video.srcObject = null;
		}
		let sending = false;
		const frames = setInterval(async () => {
			if (sending || !fallback.size) return;
			sending = true;
			try {
				// Acquire a fresh display image independently of WebRTC. Re-encoding
				// its last video frame would leave an already-stalled preview frozen.
				const dataURL = await transport.request<string>("capturePreview");
				await Promise.all([...fallback].map((id) => send(id, { type: "frame", dataURL })));
			} catch (e) {
				console.warn("Companion frame could not be delivered", e);
			} finally {
				sending = false;
			}
		}, 125);
		const off = transport.on<{
			deviceId: string;
			type: string;
			sdp: string;
			candidate: RTCIceCandidateInit;
		}>("signal", async ({ deviceId, type, sdp, candidate }) => {
			try {
				if (type === "fallback") {
					peers.get(deviceId)?.close();
					peers.delete(deviceId);
					fallback.add(deviceId);
					if (!peers.size) {
						stream?.getTracks().forEach((track) => track.stop());
						stream = undefined;
						video.srcObject = null;
					}
				} else if (type === "request") {
					fallback.delete(deviceId);
					peers.get(deviceId)?.close();
					candidates.set(deviceId, []);
					const captured = await capture();
					const peer = new RTCPeerConnection({ iceServers: [] });
					peers.set(deviceId, peer);
					for (const track of captured.getTracks()) peer.addTrack(track, captured);
					peer.onicecandidate = (e) => {
						if (e.candidate)
							void send(deviceId, {
								type: "candidate",
								candidate: e.candidate.toJSON(),
							}).catch((e) => console.warn("Companion signaling failed", e));
					};
					const offer = await peer.createOffer();
					await peer.setLocalDescription(offer);
					await send(deviceId, { type: "offer", sdp: offer.sdp });
				} else if (type === "answer") {
					const peer = peers.get(deviceId);
					if (peer) {
						await peer.setRemoteDescription({ type: "answer", sdp });
						for (const item of candidates.get(deviceId)?.splice(0) ?? [])
							await peer.addIceCandidate(item);
					}
				} else if (type === "candidate") {
					const peer = peers.get(deviceId);
					if (peer?.remoteDescription) await peer.addIceCandidate(candidate);
					else candidates.get(deviceId)?.push(candidate);
				}
			} catch (e) {
				void send(deviceId, {
					type: "error",
					message: e instanceof Error ? e.message : "Screen stream failed",
				}).catch((e) => console.warn("Could not report companion error", e));
			}
		});
		const display = transport.on("displayChanged", () => {
			for (const id of new Set([...peers.keys(), ...fallback]))
				void send(id, {
					type: "error",
					message: "Display changed. Tap Start screen to reconnect.",
				});
			stop();
		});
		const devices = transport.on<Array<{ id: string; approved: boolean; connected: boolean }>>(
			"devices",
			(list) => {
				for (const id of new Set([...peers.keys(), ...fallback]))
					if (!list.some((d) => d.id === id && d.approved && d.connected)) {
						peers.get(id)?.close();
						peers.delete(id);
						candidates.delete(id);
						fallback.delete(id);
					}
				if (!peers.size && !fallback.size) stop();
			},
		);
		return () => {
			disposed = true;
			off();
			devices();
			display();
			clearInterval(frames);
			stop();
		};
	}, [transport]);
	return null;
}
