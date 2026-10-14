import { useEffect } from "react";
import type { BoardAPI } from "../../types/board";
export function FigureMicrophone({ transport }: { transport: BoardAPI }) {
	useEffect(() => {
		let recorder: MediaRecorder | undefined;
		let stream: MediaStream | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let cancelled = false;
		let generation = 0;
		const stop = (discard: boolean) => {
			cancelled = discard;
			clearTimeout(timer);
			if (recorder && recorder.state !== "inactive") recorder.stop();
			stream?.getTracks().forEach((t) => t.stop());
			stream = undefined;
		};
		const off = transport.on<string>("figureMic", async (command) => {
			if (command !== "start") {
				if (command === "cancel" || !recorder) generation++;
				stop(command === "cancel");
				if (command === "stop" && !recorder)
					void transport
						.request(
							"aiMicError",
							"Microphone stopped before it was ready. Tap Listen again or type your topic.",
						)
						.catch(() => undefined);
				return;
			}
			stop(true);
			recorder = undefined;
			const token = ++generation;
			cancelled = false;
			try {
				const captured = await navigator.mediaDevices.getUserMedia({
					audio: { echoCancellation: true, noiseSuppression: true },
					video: false,
				});
				if (token !== generation) {
					captured.getTracks().forEach((t) => t.stop());
					return;
				}
				stream = captured;
				const chunks: Blob[] = [];
				recorder = new MediaRecorder(captured, { mimeType: "audio/webm" });
				recorder.ondataavailable = (e) => {
					if (e.data.size) chunks.push(e.data);
				};
				recorder.onstop = () => {
					if (cancelled || token !== generation) return;
					const reader = new FileReader();
					reader.onload = () => {
						if (token === generation)
							void transport
								.request("aiAudio", {
									data: String(reader.result).split(",")[1],
									mime: "audio/webm",
								})
								.catch(() => undefined);
					};
					reader.readAsDataURL(new Blob(chunks, { type: "audio/webm" }));
				};
				recorder.start();
				timer = setTimeout(() => stop(false), 20000);
			} catch {
				if (token === generation)
					void transport
						.request(
							"aiMicError",
							"Mac microphone unavailable. Check microphone permission or type your topic.",
						)
						.catch(() => undefined);
			}
		});
		return () => {
			generation++;
			off();
			stop(true);
		};
	}, [transport]);
	return null;
}
