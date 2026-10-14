import { useEffect, useRef, useState } from "react";
import type { BoardAPI } from "../../types/board";
import type { SoundEffect } from "../../types/studio";
export function Soundboard({ transport, onClose }: { transport: BoardAPI; onClose: () => void }) {
	const [info, setInfo] = useState<{
		sounds: Omit<SoundEffect, "file">[];
		recording: boolean;
		paused: boolean;
	}>();
	const [notice, setNotice] = useState("");
	const [active, setActive] = useState("");
	const audio = useRef<HTMLAudioElement>();
	useEffect(() => {
		const refresh = () =>
			void transport
				.request<typeof info>("soundboard")
				.then(setInfo)
				.catch((e) => setNotice(String(e)));
		refresh();
		const timer = setInterval(refresh, 2000);
		return () => {
			clearInterval(timer);
			audio.current?.pause();
		};
	}, [transport]);
	const play = async (id: string) => {
		try {
			if (info?.recording) {
				await transport.request("playSound", id);
				setNotice("Added to recording");
			} else {
				audio.current?.pause();
				if (active === id) {
					setActive("");
					return;
				}
				const result = await transport.request<{ dataURL: string; volume: number }>(
					"previewSound",
					id,
				);
				const player = new Audio(result.dataURL);
				audio.current = player;
				player.volume = result.volume;
				player.onended = () => setActive("");
				await player.play();
				setActive(id);
				setNotice("Preview");
			}
		} catch (e) {
			setNotice(String(e));
		}
	};
	return (
		<aside className="board-tray" aria-label="Soundboard">
			<header>
				<strong>Soundboard</strong>
				<button onClick={onClose}>Close</button>
			</header>
			<p>
				{info?.recording
					? "Tap a sound to add it to this take."
					: "Tap to preview. Import sounds and assign keys in Mac Capture settings → Sound effects."}
			</p>
			<div className="soundboard-grid">
				{info?.sounds.map((s) => (
					<button key={s.id} disabled={info.paused} onClick={() => void play(s.id)}>
						<strong>
							{active === s.id ? "■ " : info.recording ? "＋ " : "▶ "}
							{s.name}
						</strong>
						<small>{s.shortcut || `${(s.durationMs / 1000).toFixed(1)}s`}</small>
					</button>
				))}
			</div>
			{info && !info.sounds.length && <p>No sounds imported yet.</p>}
			<output role="status">{notice}</output>
		</aside>
	);
}
