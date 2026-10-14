import { useEffect, useRef, useState } from "react";
import { PlayIcon, StopIcon, SpinnerGapIcon } from "@phosphor-icons/react";

/** Only one library sample plays at a time; preview never changes the selected voice. */
export function VoicePreviewButton({
	src,
	name,
	onError,
}: {
	src?: string | null;
	name: string;
	onError: (message: string) => void;
}) {
	const audio = useRef<HTMLAudioElement | null>(null);
	const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
	useEffect(() => {
		if (!src) setState("idle");
		const stop = () => {
			audio.current?.pause();
			setState("idle");
		};
		window.addEventListener("voice-preview-stop", stop);
		return () => {
			window.removeEventListener("voice-preview-stop", stop);
			audio.current?.pause();
			audio.current = null;
		};
	}, [src]);
	const toggle = async () => {
		if (state !== "idle") {
			audio.current?.pause();
			setState("idle");
			return;
		}
		if (!src) return;
		window.dispatchEvent(new Event("voice-preview-stop"));
		const player = new Audio(src);
		audio.current = player;
		player.onended = () => setState("idle");
		player.onerror = () => {
			setState("idle");
			onError("Preview unavailable. Try another voice or refresh the list.");
		};
		setState("loading");
		try {
			await player.play();
			if (audio.current === player && !player.paused) setState("playing");
		} catch {
			setState("idle");
			onError("Preview could not play. Check your connection and try again.");
		}
	};
	return (
		<button
			type="button"
			className="voice-preview"
			disabled={!src}
			onClick={() => void toggle()}
			aria-label={`${state === "idle" ? "Preview" : "Stop preview of"} ${name}`}
			data-help={
				src
					? "Listen to this voice without selecting it or changing your recording."
					: "ElevenLabs has not provided a preview for this voice."
			}
		>
			{state === "loading" ? (
				<SpinnerGapIcon className="voice-spin" size={15} />
			) : state === "playing" ? (
				<StopIcon size={14} weight="fill" />
			) : (
				<PlayIcon size={14} weight="fill" />
			)}
		</button>
	);
}
