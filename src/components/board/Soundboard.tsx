import { useEffect, useRef, useState } from "react";
import type { BoardAPI } from "../../types/board";
import type { SoundEffect } from "../../types/studio";
import { VoiceCuePicker } from "../studio/VoiceCuePicker";
export function Soundboard({
	transport,
	onClose,
	initialTab = "sounds",
}: {
	transport: BoardAPI;
	onClose: () => void;
	initialTab?: "sounds" | "voices";
}) {
	const [info, setInfo] = useState<{
		sounds: Omit<SoundEffect, "file">[];
		streaming: boolean;
		recording: boolean;
		paused: boolean;
		includeSoundboardInRecording: boolean;
	}>();
	const [notice, setNotice] = useState("");
	const noticeTimer = useRef<ReturnType<typeof setTimeout>>();
	useEffect(() => () => clearTimeout(noticeTimer.current), []);
	const [tab, setTab] = useState<"sounds" | "voices">(initialTab);
	const [search, setSearch] = useState("");
	useEffect(() => {
		const refresh = () =>
			void transport
				.request<typeof info>("soundboard")
				.then(setInfo)
				.catch((e) => setNotice(String(e)));
		refresh();
		const timer = setInterval(refresh, 1500);
		return () => clearInterval(timer);
	}, [transport]);
	const preference = async (id: string, kind: "favorite" | "love", value: boolean) => {
		try {
			setInfo(await transport.request("setSoundPreference", { id, kind, value }));
		} catch (e) {
			setNotice(String(e));
		}
	};
	const play = async (id: string) => {
		clearTimeout(noticeTimer.current);
		try {
			await transport.request("playSound", id);
			setNotice(
				info?.streaming
					? "Sent to stream output"
					: info?.recording
						? info.includeSoundboardInRecording
							? "Included in recording"
							: "Added as an editable clip"
						: "Playing on the Mac",
			);
			noticeTimer.current = setTimeout(
				() => setNotice(""),
				Math.max(1800, info?.sounds.find((s) => s.id === id)?.durationMs ?? 3000),
			);
		} catch (e) {
			setNotice(String(e));
		}
	};
	return (
		<aside className="board-tray soundboard-tray" aria-label="Soundboard">
			<header>
				<strong>Soundboard</strong>
				<button onClick={onClose}>Close</button>
			</header>
			{info?.streaming && (
				<p>
					● Stream mode{" "}
					<button onClick={() => void transport.request("streamStop")}>
						Stop stream
					</button>
				</p>
			)}
			<nav>
				<button aria-pressed={tab === "sounds"} onClick={() => setTab("sounds")}>
					Sounds
				</button>
				<button aria-pressed={tab === "voices"} onClick={() => setTab("voices")}>
					Voices
				</button>
			</nav>
			{tab === "voices" ? (
				info?.streaming ? (
					<p>
						Stream mode uses the live voice-changer input configured on the Mac. Change
						its voice in that app. ElevenLabs choices are for recorded narration.
					</p>
				) : (
					<VoiceCuePicker request={transport.request} />
				)
			) : (
				<>
					<p className="soundboard-help">
						Tap to play on the Mac.{" "}
						{info?.streaming
							? "Sent to stream output"
							: info?.recording
								? info.includeSoundboardInRecording
									? "Sounds are included in recorded audio."
									: "Sounds stay editable after recording."
								: "Manage sounds in Mac Capture settings → Sound effects."}
					</p>
					<input
						type="search"
						aria-label="Find sound"
						placeholder="Find a sound…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
					<div className="soundboard-grid">
						{info?.sounds
							.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
							.map((s) => (
								<div key={s.id} className="soundboard-item">
									<button
										style={{ borderLeft: `5px solid ${s.color || "#466784"}` }}
										disabled={info.paused}
										onClick={() => void play(s.id)}
									>
										<strong>
											{s.favorite ? "★ " : "▶ "}
											{s.name}
										</strong>
										<small>
											{s.shortcut || `${(s.durationMs / 1000).toFixed(1)}s`}
										</small>
									</button>
									<div className="soundboard-preferences">
										<button
											title="Favorite ★ — pin for the current recording. Resets after the take; Love keeps it across projects."
											aria-label={`${s.favorite ? "Unfavorite" : "Favorite"} ${s.name}`}
											aria-pressed={!!s.favorite}
											onClick={() =>
												void preference(s.id, "favorite", !s.favorite)
											}
										>
											{s.favorite ? "★" : "☆"}
										</button>
										<button
											title="Love ♥ — keep near the top across all projects and recordings until you unlove it."
											aria-label={`${s.loved ? "Unlove" : "Love"} ${s.name}`}
											aria-pressed={!!s.loved}
											onClick={() => void preference(s.id, "love", !s.loved)}
										>
											{s.loved ? "♥" : "♡"}
										</button>
									</div>
								</div>
							))}
					</div>
					{info && !info.sounds.length && <p>No sounds imported yet.</p>}
					{info && !info.includeSoundboardInRecording && (
						<small>
							Use headphones so speaker playback does not duplicate editable sound
							clips.
						</small>
					)}
				</>
			)}
			<output role="status">{notice}</output>
		</aside>
	);
}
