import { useEffect, useRef, useState } from "react";
import type { BoardAPI } from "../../../types/board";
import type { ChartInfo, ChartPlayback } from "../../../types/charts";
import { acceptPlayback, isPlaying } from "./chartPlayback";
import { revealSteps } from "./chartModel";

export interface ChartsState extends Omit<ChartInfo, "serverNow"> {
	/** Mac clock minus this device's clock, so the iPad computes the Mac's reveal. */
	offset: number;
	loaded: boolean;
}
const empty = (): ChartsState => ({
	charts: [],
	playback: {},
	job: { phase: "idle", jobId: "", started: 0, error: "" },
	hasKey: false,
	offset: 0,
	loaded: false,
});
export function useCharts(transport: BoardAPI) {
	const [state, setState] = useState(empty);
	useEffect(() => {
		let live = true;
		const accept = (info: ChartInfo) => {
			if (!live) return;
			// A snapshot (reconnect, edit) carries authoritative playback; merge by sequence.
			setState((old) => {
				// A newer event may arrive before an older snapshot reply. Charts the Mac no longer
				// tracks (e.g. after it restarted) take the snapshot as-is.
				let playback = info.playback;
				for (const p of Object.values(old.playback))
					if (info.playback[p.chartId]) playback = acceptPlayback(playback, p);
				return { charts: info.charts, playback, job: info.job, hasKey: info.hasKey, offset: info.serverNow - Date.now(), loaded: true };
			});
		};
		const refresh = () =>
			void transport
				.request<ChartInfo>("chartInfo")
				.then(accept)
				.catch(() => undefined);
		refresh();
		const offCharts = transport.on<ChartInfo>("charts", accept);
		const offPlayback = transport.on<ChartPlayback & { serverNow: number }>("chartPlayback", (p) => {
			if (!live) return;
			const { serverNow, ...playback } = p;
			setState((old) => ({ ...old, offset: serverNow - Date.now(), playback: acceptPlayback(old.playback, playback) }));
		});
		const offConnected = transport.on("connected", refresh);
		return () => {
			live = false;
			offCharts();
			offPlayback();
			offConnected();
		};
	}, [transport]);
	return state;
}
/** Re-render every frame only while some chart is mid-reveal. */
export function useChartClock(state: ChartsState) {
	const [now, setNow] = useState(() => Date.now() + state.offset);
	const frame = useRef(0);
	const active = state.charts.some((c) =>
		isPlaying(state.playback[c.id], Date.now() + state.offset, revealSteps(c.data, c.reveal.order)),
	);
	useEffect(() => {
		setNow(Date.now() + state.offset);
		if (!active) return;
		const tick = () => {
			setNow(Date.now() + state.offset);
			frame.current = requestAnimationFrame(tick);
		};
		frame.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame.current);
	}, [active, state.offset, state.playback]);
	return active ? now : Date.now() + state.offset;
}
