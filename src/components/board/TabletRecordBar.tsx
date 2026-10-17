import { useEffect, useState } from "react";
import type { BoardAPI } from "../../types/board";
import { useRecordControls } from "./useRecordControls";
import {
	needsStopConfirmation,
	pauseIntent,
	recordIntent,
	recordingCorner,
	recordingTime,
} from "./recordControlModel";
import "./recordControls.css";
export function TabletRecordBar({ transport }: { transport: BoardAPI }) {
	const controls = useRecordControls(transport);
	const { status, connected, pending, command, feedback } = controls;
	const [corner, setCorner] = useState(() =>
		recordingCorner(localStorage.getItem("presenter-record-corner")),
	);
	const [collapsed, setCollapsed] = useState(
		() => localStorage.getItem("presenter-record-collapsed") === "true",
	);
	const [confirmStop, setConfirmStop] = useState(
		() => localStorage.getItem("presenter-confirm-stop") !== "false",
	);
	const [settings, setSettings] = useState(false);
	useEffect(() => {
		localStorage.setItem("presenter-record-corner", corner);
		localStorage.setItem("presenter-record-collapsed", String(collapsed));
		localStorage.setItem("presenter-confirm-stop", String(confirmStop));
	}, [corner, collapsed, confirmStop]);
	return (
		<aside className="tablet-record-edge" data-corner={corner} aria-label="Recording controls">
			<div className="tablet-record-controls" data-paused={status.recording && status.paused}>
				{collapsed ? (
					<button
						aria-label="Expand recording controls"
						onClick={() => setCollapsed(false)}
					>
						<span className="record-symbol">{status.recording ? "■" : "●"}</span>{" "}
						{recordingTime(status.elapsed)} {status.paused ? "Paused" : ""} ▴
					</button>
				) : (
					<>
						<button
							disabled={!connected || pending}
							aria-label={status.recording ? "Stop recording" : "Start recording"}
							onClick={() => {
								if (
									needsStopConfirmation(status, confirmStop) &&
									!window.confirm("Stop and save this recording?")
								)
									return;
								void command(recordIntent(status));
							}}
						>
							<span className="record-symbol">{status.recording ? "■" : "●"}</span>
							<span>{recordingTime(status.elapsed)}</span>
						</button>
						<button
							disabled={!connected || pending || !status.recording}
							aria-label={status.paused ? "Resume recording" : "Pause recording"}
							onClick={() => {
								const intent = pauseIntent(status);
								if (intent) void command(intent);
							}}
						>
							{status.paused ? "▶ Resume" : "Ⅱ Pause"}
						</button>
						<button
							aria-label="Recording control settings"
							aria-expanded={settings}
							onClick={() => setSettings(!settings)}
						>
							⚙
						</button>
						<button
							aria-label="Minimize recording controls"
							onClick={() => {
								setCollapsed(true);
								setSettings(false);
							}}
						>
							−
						</button>
					</>
				)}
				<span className="record-feedback" role="status">
					{!connected ? "Offline" : feedback || "Ready"}
				</span>
			</div>
			{settings && (
				<div className="record-bar-settings">
					<label>
						Corner{" "}
						<select
							aria-label="Recording controls corner"
							value={corner}
							onChange={(e) => setCorner(recordingCorner(e.target.value))}
						>
							{["top-left", "top-right", "bottom-left", "bottom-right"].map((c) => (
								<option key={c} value={c}>
									{c.replace("-", " ")}
								</option>
							))}
						</select>
					</label>
					<label>
						<input
							type="checkbox"
							checked={confirmStop}
							onChange={(e) => setConfirmStop(e.target.checked)}
						/>
						Confirm Stop after 5 seconds
					</label>
				</div>
			)}
		</aside>
	);
}
