import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardAPI, BoardStatus } from "../../types/board";
import { idleRecording, intentAllowed, type RecordIntent } from "./recordControlModel";
export function useRecordControls(transport: BoardAPI) {
	const [status, setStatus] = useState(idleRecording),
		[connected, setConnected] = useState(false),
		[pending, setPending] = useState(false),
		[feedback, setFeedback] = useState("");
	const active = useRef<RecordIntent>();
	const timer = useRef<ReturnType<typeof setTimeout>>();
	useEffect(() => {
		const accept = (next: BoardStatus) => {
			setStatus({ ...next, paused: next.recording && next.paused });
			setConnected(true);
			if (active.current && !intentAllowed(next, active.current)) {
				active.current = undefined;
				setPending(false);
				clearTimeout(timer.current);
			}
			if (!active.current)
				setFeedback(next.recording ? (next.paused ? "Paused" : "Recording") : "Ready");
		};
		const refresh = () => {
			void transport
				.request<{ status: BoardStatus }>("tabletInfo")
				.then((r) => accept(r.status))
				.catch(() => setConnected(false));
		};
		const offs = [
			transport.on<BoardStatus>("status", accept),
			transport.on<{ status: BoardStatus }>("info", (r) => accept(r.status)),
			transport.on("connected", refresh),
			transport.on("disconnected", () => {
				setConnected(false);
				active.current = undefined;
				setPending(false);
				clearTimeout(timer.current);
				setFeedback("Disconnected — check the Mac");
			}),
		];
		refresh();
		return () => {
			offs.forEach((off) => off());
			clearTimeout(timer.current);
		};
	}, [transport]);
	const command = useCallback(
		async (intent: RecordIntent) => {
			if (!connected || active.current || !intentAllowed(status, intent)) return;
			active.current = intent;
			setPending(true);
			setFeedback("Waiting for Mac…");
			timer.current = setTimeout(() => {
				active.current = undefined;
				setPending(false);
				setFeedback("No confirmation yet. Check recording on the Mac before retrying.");
			}, 16000);
			try {
				await transport.request("recordControl", { intent });
			} catch (e) {
				active.current = undefined;
				clearTimeout(timer.current);
				setPending(false);
				setFeedback(String(e));
			}
		},
		[transport, status, connected],
	);
	return { status, connected, pending, feedback, command };
}
