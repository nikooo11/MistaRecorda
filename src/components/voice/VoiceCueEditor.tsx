import { useState } from "react";
import type { VoiceCue } from "../../lib/voiceCues";
import type { VoiceRecording } from "../../types/voice";
import { unwrapVoice } from "../../types/voice";
export function VoiceCueEditor({
	recording,
	disabled,
	onSeek,
}: {
	recording: VoiceRecording | null;
	disabled: boolean;
	onSeek?: (timeMs: number) => void;
}) {
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	if (!recording?.voiceCues?.length) return null;
	const cues = recording.voiceCues;
	const voices = [
		...new Map(
			cues.filter((c) => c.settings).map((c) => [c.settings!.voiceId, c.settings!]),
		).values(),
	];
	const save = async (next: VoiceCue[]) => {
		setBusy(true);
		setError("");
		try {
			unwrapVoice(
				await window.electronAPI.voice.request("setVoiceCues", {
					videoPath: recording.videoPath,
					cues: next,
				}),
			);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};
	return (
		<section className="voice-cue-editor">
			<h2>Narration voices</h2>
			<p>
				Each voice starts here and lasts until the next row. Your original microphone audio
				is kept. After editing, click Process voice via ElevenLabs.
			</p>
			{cues.map((cue, i) => (
				<div
					key={`${cue.id}-${cue.startMs}`}
					style={{
						borderLeft: `4px solid ${cue.color}`,
						paddingLeft: 6,
						marginBottom: 6,
						display: "flex",
						gap: 6,
					}}
				>
					<button
						type="button"
						onClick={() => onSeek?.(cue.startMs)}
						title="Jump to this narration region"
					>
						▶
					</button>
					<input
						aria-label={`Voice region ${i + 1} start seconds`}
						type="number"
						min={0}
						step={0.1}
						defaultValue={cue.startMs / 1000}
						disabled={i === 0 || disabled || busy}
						style={{ width: 75 }}
						onBlur={(e) => {
							const startMs = Math.round(Number(e.target.value) * 1000);
							if (startMs !== cue.startMs)
								void save(
									cues.map((c) => (c.id === cue.id ? { ...c, startMs } : c)),
								);
						}}
					/>
					<select
						aria-label={`Voice for region ${i + 1}`}
						value={cue.settings?.voiceId ?? ""}
						disabled={disabled || busy}
						onChange={(e) => {
							const settings =
								voices.find((v) => v.voiceId === e.target.value) ?? null;
							void save(
								cues.map((c) =>
									c.id === cue.id
										? {
												...c,
												settings,
												color:
													cues.find(
														(v) =>
															v.settings?.voiceId ===
															settings?.voiceId,
													)?.color ?? "#777e89",
											}
										: c,
								),
							);
						}}
					>
						<option value="">Original voice</option>
						{voices.map((v) => (
							<option key={v.voiceId} value={v.voiceId}>
								{v.voiceName || v.voiceId}
							</option>
						))}
					</select>
					{i > 0 && (
						<button
							type="button"
							disabled={disabled || busy}
							onClick={() => void save(cues.filter((c) => c.id !== cue.id))}
							aria-label={`Remove voice change ${i}`}
						>
							×
						</button>
					)}
				</div>
			))}
			<output role="status">{error}</output>
		</section>
	);
}
