import { useEffect, useRef, useState } from "react";
import type { BoardAPI } from "../../types/board";
import type { SceneMediaPlayback } from "../../types/studio";

function Media({
	source,
	playback,
	audible,
}: {
	source: SceneMediaPlayback["sources"][number];
	playback: SceneMediaPlayback;
	audible: boolean;
}) {
	const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const sync = () => {
			const duration = source.durationMs ?? 0;
			const time =
				duration && source.loop ? playback.elapsedMs % duration : playback.elapsedMs;
			if (
				Number.isFinite(element.duration) &&
				Math.abs(element.currentTime - time / 1000) > 0.35
			)
				element.currentTime = Math.min(element.duration, time / 1000);
			element.volume = source.volume;
			const finished = !source.loop && duration > 0 && playback.elapsedMs >= duration;
			// play() restarts an ended element; non-looping sources must hold their end.
			if (playback.playing && !finished) void element.play().catch(() => undefined);
			else element.pause();
		};
		sync();
		element.addEventListener("loadedmetadata", sync);
		return () => element.removeEventListener("loadedmetadata", sync);
	}, [playback.playing, playback.elapsedMs, source.loop, source.durationMs, source.volume]);
	const style = {
		position: "absolute" as const,
		left: `${source.x * 100}%`,
		top: `${source.y * 100}%`,
		width: `${source.width * 100}%`,
		height: `${source.height * 100}%`,
		objectFit: "contain" as const,
		opacity: source.opacity,
	};
	if (source.kind === "image")
		return <img src={source.url} alt={source.name} style={style} draggable={false} />;
	if (source.kind === "audio")
		return audible ? (
			<audio ref={ref} src={source.url} loop={source.loop} preload="auto" />
		) : null;
	return (
		<video
			ref={ref}
			src={source.url}
			playsInline
			muted={!audible || !source.hasAudio || source.volume === 0}
			loop={source.loop}
			preload="auto"
			style={style}
		/>
	);
}

export function SceneMediaLayer({
	transport,
	audible,
	visible,
	width,
	height,
	scale,
	left,
	top,
	view,
}: {
	transport: BoardAPI;
	audible: boolean;
	visible: boolean;
	width: number;
	height: number;
	scale: number;
	left: number;
	top: number;
	view: { x: number; y: number; zoom: number };
}) {
	const [playback, setPlayback] = useState<SceneMediaPlayback>();
	useEffect(() => {
		let disposed = false;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			try {
				const value = await transport.request<SceneMediaPlayback>("sceneMedia");
				if (!disposed) setPlayback(value);
			} catch {
				if (!disposed) setPlayback(undefined);
			}
			if (!disposed) timer = setTimeout(poll, 250);
		};
		void poll();
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, [transport]);
	if (!playback?.sources.length) return null;
	return (
		<div
			aria-hidden="true"
			style={{
				position: "absolute",
				pointerEvents: "none",
				left,
				top,
				width: width * scale,
				height: height * scale,
				overflow: "hidden",
			}}
		>
			<div
				style={{
					width: "100%",
					height: "100%",
					transformOrigin: "top left",
					transform: `translate(${view.x * scale * view.zoom}px, ${view.y * scale * view.zoom}px) scale(${view.zoom})`,
					visibility: visible ? "visible" : "hidden",
				}}
			>
				{[...playback.sources].reverse().map((source) => (
					<Media
						key={`${playback.sceneId}-${source.id}`}
						source={source}
						playback={playback}
						audible={audible}
					/>
				))}
			</div>
		</div>
	);
}
