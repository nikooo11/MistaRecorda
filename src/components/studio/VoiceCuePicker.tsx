import { useCallback, useEffect, useState } from "react";
export function VoiceCuePicker({
	request,
}: {
	request: <T = unknown>(method: string, input?: unknown) => Promise<T>;
}) {
	const [info, setInfo] = useState<{
		recording: boolean;
		selected: string;
		hasKey: boolean;
		voices: { id: string; name: string; favorite: boolean; color: string }[];
	}>();
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const refresh = useCallback(
		async (fetchLatest = false) => {
			setBusy(true);
			try {
				setInfo(await request("recordingVoices", fetchLatest));
				setError("");
			} catch (e) {
				setError(String(e));
			} finally {
				setBusy(false);
			}
		},
		[request],
	);
	useEffect(() => {
		void refresh();
	}, [refresh]);
	useEffect(() => {
		let mounted = true;
		const timer = setInterval(() => {
			void request<NonNullable<typeof info>>("recordingVoices", false)
				.then((next) => {
					if (mounted) setInfo(next);
				})
				.catch(() => undefined);
		}, 1500);
		return () => {
			mounted = false;
			clearInterval(timer);
		};
	}, [request]);
	const select = async (id: string) => {
		setBusy(true);
		try {
			setInfo(await request("selectRecordingVoice", id));
			setError("");
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	};
	return (
		<div className="voice-cue-picker">
			<p>
				Record your normal voice. Choose a voice to mark the narration from now until your
				next choice. Process it after recording.
			</p>
			<button
				disabled={busy}
				aria-pressed={info?.selected === ""}
				onClick={() => void select("")}
			>
				Original voice {info?.selected === "" ? "· Selected" : ""}
			</button>
			<div className="soundboard-grid">
				{info?.voices.map((v) => (
					<button
						key={v.id}
						style={{ borderLeft: `4px solid ${v.color}` }}
						aria-pressed={v.id === info.selected}
						disabled={busy}
						onClick={() => void select(v.id)}
					>
						{v.favorite ? "★ " : ""}
						{v.name}
						{v.id === info.selected ? " · Selected" : ""}
					</button>
				))}
			</div>
			{info && !info.hasKey && (
				<p>Connect ElevenLabs in the Mac editor → Voice to load your voices.</p>
			)}
			{info?.recording && !info.voices.length && (
				<p>
					Load your voices before starting the next recording. This take still records
					your original microphone.
				</p>
			)}
			<button disabled={busy || info?.recording} onClick={() => void refresh(true)}>
				Refresh voices
			</button>
			<output role="status">{error}</output>
		</div>
	);
}
