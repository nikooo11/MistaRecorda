import { useEffect, useRef } from "react";
import type { BoardAPI } from "../../types/board";
export function BoardStream({ transport }: { transport: BoardAPI }) {
	const peers = useRef(new Map<string, RTCPeerConnection>());
	const stream = useRef<MediaStream>();
	const candidates = useRef(new Map<string, RTCIceCandidateInit[]>());
	useEffect(() => {
		const off = transport.on<{
			deviceId: string;
			type: string;
			sdp: string;
			candidate: RTCIceCandidateInit;
		}>("signal", async ({ deviceId, type, sdp, candidate }) => {
			try {
				if (type === "request") {
					peers.current.get(deviceId)?.close();
					candidates.current.set(deviceId, []);
					if (
						!stream.current ||
						stream.current.getVideoTracks()[0]?.readyState !== "live"
					) {
						const id = await transport.request<string>("captureSource");
						stream.current = await navigator.mediaDevices.getUserMedia({
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
					}
					const peer = new RTCPeerConnection({ iceServers: [] });
					peers.current.set(deviceId, peer);
					for (const track of stream.current.getTracks())
						peer.addTrack(track, stream.current);
					peer.onicecandidate = (e) => {
						if (e.candidate)
							void transport.request("signalToDevice", {
								deviceId,
								signal: { type: "candidate", candidate: e.candidate.toJSON() },
							});
					};
					const offer = await peer.createOffer();
					await peer.setLocalDescription(offer);
					await transport.request("signalToDevice", {
						deviceId,
						signal: { type: "offer", sdp: offer.sdp },
					});
				} else if (type === "answer") {
					const peer = peers.current.get(deviceId);
					if (peer) {
						await peer.setRemoteDescription({ type: "answer", sdp });
						for (const item of candidates.current.get(deviceId)?.splice(0) ?? [])
							await peer.addIceCandidate(item);
					}
				} else if (type === "candidate") {
					const peer = peers.current.get(deviceId);
					if (peer?.remoteDescription) await peer.addIceCandidate(candidate);
					else candidates.current.get(deviceId)?.push(candidate);
				}
			} catch (e) {
				void transport.request("signalToDevice", {
					deviceId,
					signal: {
						type: "error",
						message: e instanceof Error ? e.message : "Screen stream failed",
					},
				});
			}
		});
		const display = transport.on("displayChanged", () => {
			stream.current?.getTracks().forEach((t) => t.stop());
			stream.current = undefined;
			for (const [deviceId, peer] of peers.current) {
				peer.close();
				void transport.request("signalToDevice", {
					deviceId,
					signal: {
						type: "error",
						message: "Display changed. Tap Start screen to reconnect.",
					},
				});
			}
			peers.current.clear();
		});
		const devices = transport.on(
			"devices",
			(list: Array<{ id: string; approved: boolean; connected: boolean }>) => {
				for (const [id, peer] of peers.current)
					if (!list.some((d) => d.id === id && d.approved && d.connected)) {
						peer.close();
						peers.current.delete(id);
					}
				if (!peers.current.size) {
					stream.current?.getTracks().forEach((t) => t.stop());
					stream.current = undefined;
				}
			},
		);
		return () => {
			off();
			devices();
			display();
			for (const p of peers.current.values()) p.close();
			stream.current?.getTracks().forEach((t) => t.stop());
		};
	}, [transport]);
	return null;
}
