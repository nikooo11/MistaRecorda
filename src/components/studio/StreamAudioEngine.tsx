import { useEffect } from "react";
import type { StreamRouting } from "../../types/streamAudio";
/** Separate hidden renderer: closing a settings panel must never interrupt a stream. */
export function StreamAudioEngine() {
	useEffect(() => {
		let context: AudioContext | undefined;
		let microphone: MediaStream | undefined;
		let output: HTMLAudioElement | undefined;
		let monitor: HTMLAudioElement | undefined;
		let mix: MediaStreamAudioDestinationNode | undefined;
		let headphones: MediaStreamAudioDestinationNode | undefined;
		let chain = Promise.resolve();
		const stop = async () => {
			microphone?.getTracks().forEach((t) => {
				t.onended = null;
				t.stop();
			});
			microphone = undefined;
			for (const player of [output, monitor]) {
				if (player) {
					player.pause();
					player.srcObject = null;
				}
			}
			output = undefined;
			monitor = undefined;
			mix = undefined;
			headphones = undefined;
			await context?.close();
			context = undefined;
		};
		const run = async (method: string, input: unknown) => {
			if (method === "devices") {
				const permission = await navigator.mediaDevices.getUserMedia({ audio: true });
				permission.getTracks().forEach((t) => t.stop());
				return (await navigator.mediaDevices.enumerateDevices())
					.filter((d) => d.kind === "audioinput" || d.kind === "audiooutput")
					.map((d) => ({
						id: d.deviceId,
						label: d.label,
						kind: d.kind,
						groupId: d.groupId,
					}));
			}
			if (method === "stop") return stop();
			if (method === "start") {
				await stop();
				const routing = input as StreamRouting;
				try {
					const devices = await navigator.mediaDevices.enumerateDevices();
					const target = devices.find(
						(d) => d.kind === "audiooutput" && d.deviceId === routing.output,
					);
					const source = devices.find(
						(d) => d.kind === "audioinput" && d.deviceId === routing.input,
					);
					if (!target || !source)
						throw Error(
							"A saved audio device is unavailable. Refresh devices and choose again.",
						);
					if (target.groupId && target.groupId === source.groupId)
						throw Error(
							"Input and output cannot be the same virtual device (audio feedback).",
						);
					if (routing.output === routing.monitor)
						throw Error("Use separate virtual output and headphones devices.");
					context = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
					await context.resume();
					microphone = await navigator.mediaDevices.getUserMedia({
						audio: {
							deviceId: { exact: routing.input },
							echoCancellation: false,
							noiseSuppression: false,
							autoGainControl: false,
						},
					});
					mix = context.createMediaStreamDestination();
					headphones = context.createMediaStreamDestination();
					context.createMediaStreamSource(microphone).connect(mix);
					output = new Audio();
					await output.setSinkId(routing.output);
					output.srcObject = mix.stream;
					await output.play();
					monitor = new Audio();
					await monitor.setSinkId(routing.monitor || "default");
					monitor.srcObject = headphones.stream;
					await monitor.play();
					microphone.getTracks().forEach((t) => {
						t.onended = () => {
							void stop().finally(() =>
								window.electronAPI.studio.request("audioEngineEnded"),
							);
						};
					});
				} catch (e) {
					await stop();
					throw e;
				}
				return true;
			}
			if (method === "sound") {
				if (!context || !mix || !headphones) throw Error("Stream mode is stopped.");
				const data = input as { data: string; volume: number };
				const bytes = Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0));
				const buffer = await context.decodeAudioData(bytes.buffer);
				const sound = context.createBufferSource();
				sound.buffer = buffer;
				const gain = context.createGain();
				gain.gain.value = Math.max(0, Math.min(2, data.volume));
				sound.connect(gain);
				gain.connect(mix);
				gain.connect(headphones);
				sound.onended = () => {
					sound.disconnect();
					gain.disconnect();
				};
				sound.start();
				return true;
			}
			throw Error("Unknown audio command.");
		};
		const off = window.electronAPI.studio.onAudioCommand((command) => {
			chain = chain.then(async () => {
				try {
					const result = await run(command.method, command.input);
					await window.electronAPI.studio.request("audioEngineReply", {
						id: command.id,
						result,
					});
				} catch (e) {
					await window.electronAPI.studio.request("audioEngineReply", {
						id: command.id,
						error: String(e),
					});
				}
			});
		});
		void window.electronAPI.studio.request("audioEngineReady");
		return () => {
			off();
			void stop();
		};
	}, []);
	return null;
}
