import { useEffect, useRef, useState } from "react";
import {
	PlayIcon,
	PauseIcon,
	SkipBackIcon,
	CaretLeftIcon,
	CaretRightIcon,
	FastForwardIcon,
	XIcon,
	EyeIcon,
} from "@phosphor-icons/react";
import type { BoardAPI } from "../../../types/board";
import type { ChartDocument } from "../../../types/charts";
import { revealSteps } from "./chartModel";
import { isPlaying, revealAt, type PlaybackCommand } from "./chartPlayback";
import type { ChartsState } from "./useCharts";

/** Private reveal controls. This panel lives only in the iPad/editor UI, never in the clean surface. */
export function ChartPresenter({
	transport,
	charts,
	chartId,
	now,
	placement,
	onChoose,
	onReveal,
	onClose,
	anchor,
}: {
	/** Stage position right below the placed chart; absent = floating panel. */
	anchor?: { left: number; top: number; width: number };
	transport: BoardAPI;
	charts: ChartsState;
	chartId?: string;
	now: number;
	/** Where the chart sits in the current scene: absent, private shadow or visible. */
	placement: "none" | "shadow" | "visible";
	onChoose: (id: string) => void;
	onReveal: () => Promise<void>;
	onClose: () => void;
}) {
	const chart: ChartDocument | undefined = charts.charts.find((c) => c.id === chartId) ?? charts.charts[0];
	const [error, setError] = useState("");
	const lastSeek = useRef(0);
	const pendingSeek = useRef<ReturnType<typeof setTimeout>>();
	useEffect(() => () => clearTimeout(pendingSeek.current), []);
	if (!chart)
		return (
			<aside className="board-tray chart-presenter" role="dialog" aria-label="Present chart">
				<header>
					<strong>Present chart</strong>
					<button aria-label="Close Present chart" onClick={onClose}>
						<XIcon size={16} />
					</button>
				</header>
				<p>Create a chart in AI Chart first.</p>
			</aside>
		);
	const steps = revealSteps(chart.data, chart.reveal.order);
	const p = charts.playback[chart.id];
	const reveal = revealAt(p, now, steps);
	const playing = isPlaying(p, now, steps);
	const send = (command: PlaybackCommand) =>
		transport.request("chartPlayback", { id: chart.id, command }).then(
			() => setError(""),
			(e) => setError(e instanceof Error ? e.message : String(e)),
		);
	// Slider ticks are throttled; the final position is always sent.
	const seek = (position: number) => {
		clearTimeout(pendingSeek.current);
		const wait = 40 - (Date.now() - lastSeek.current);
		const go = () => {
			lastSeek.current = Date.now();
			void send({ action: "seek", position });
		};
		if (wait <= 0) go();
		else pendingSeek.current = setTimeout(go, wait);
	};
	const scrubFrom = (input: HTMLInputElement, clientX: number) => {
		const r = input.getBoundingClientRect();
		// Native range thumbs inset by about half their width at each end.
		const inset = Math.min(10, r.width / 4);
		const t = Math.max(0, Math.min(1, (clientX - r.left - inset) / Math.max(1, r.width - inset * 2)));
		seek(Math.round(t * steps * 100) / 100);
	};
	const unit = chart.data.kind === "pie" ? "slice" : chart.reveal.order === "series" && chart.data.series.length > 1 ? "series" : chart.data.kind === "card" ? "statistic" : "point";
	const speed = chart.reveal.msPerStep;
	return (
		<aside
			key={anchor ? "attached" : "floating"}
			data-panel-attached={anchor ? "true" : undefined}
			className={`board-tray chart-presenter ${anchor ? "is-anchored" : ""}`}
			role="dialog"
			aria-label="Present chart"
			style={anchor ? { left: anchor.left, top: anchor.top, width: anchor.width } : undefined}
			onPointerDown={(e) => e.stopPropagation()}
			onKeyDown={(e) => {
				e.stopPropagation();
				if (e.target instanceof HTMLInputElement && e.target.type !== "range") return;
				if (e.key === " ") {
					e.preventDefault();
					void send({ action: playing ? "pause" : "play" });
				} else if (e.key === "ArrowRight" && !(e.target instanceof HTMLInputElement)) void send({ action: "next" });
				else if (e.key === "ArrowLeft" && !(e.target instanceof HTMLInputElement)) void send({ action: "previous" });
			}}
		>
			<header>
				{anchor ? (
					<p className="chart-present-status" aria-live="polite">
						{Math.floor(reveal + 1e-6)}/{steps} · {playing ? "Playing" : reveal >= steps ? "All shown" : reveal <= 0 ? "Title & axes" : "Paused"}
					</p>
				) : (
					<strong>Present chart</strong>
				)}
				<button aria-label="Close Present chart" onClick={onClose}>
					<XIcon size={16} />
				</button>
			</header>
			{!anchor && charts.charts.length > 1 && (
				<select aria-label="Chart to present" value={chart.id} onChange={(e) => onChoose(e.target.value)}>
					{charts.charts.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</select>
			)}
			{!anchor && <p className="chart-present-status" aria-live="polite">
				{chart.name} · {Math.floor(reveal + 1e-6)} of {steps} {unit}
				{steps === 1 ? "" : "s"} · {playing ? "Playing" : reveal >= steps ? "All shown" : reveal <= 0 ? "Title & axes only" : "Paused"}
			</p>}
			{placement !== "visible" && (
				<p className="chart-present-hint">
					{placement === "none"
						? "Not placed in this scene yet. Place it from AI Chart or your objects."
						: "Shadow · only on this iPad, showing the end frame. Show on screen starts the audience reveal from the title and axes."}
					{placement === "shadow" && (
						<button
							disabled={chart.status !== "reviewed"}
							title={chart.status === "reviewed" ? "" : "Confirm the chart's data first."}
							onClick={() => void onReveal().catch((e) => setError(String(e)))}
						>
							<EyeIcon size={14} /> Show on screen
						</button>
					)}
				</p>
			)}
			<input
				className="chart-slider"
				type="range"
				min={0}
				max={steps}
				step={0.01}
				value={reveal}
				aria-label="Reveal position. Drag back to hide data again."
				// Only deliberate input moves the reveal: keyboard with focus, or the captured drag below.
				// Value clamping (e.g. switching to a chart with fewer steps) must never seek.
				onChange={(e) => {
					const value = Number(e.target.value);
					if (document.activeElement === e.currentTarget && Math.abs(value - reveal) > 0.004) seek(value);
				}}
				// A pen or finger that lands on the slider always scrubs, even in Draw mode;
				// capture keeps the whole stroke here so it never draws on the canvas.
				onPointerDown={(e) => {
					e.preventDefault();
					e.stopPropagation();
					e.currentTarget.setPointerCapture(e.pointerId);
					scrubFrom(e.currentTarget, e.clientX);
				}}
				onPointerMove={(e) => {
					if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
					e.preventDefault();
					scrubFrom(e.currentTarget, e.clientX);
				}}
				onPointerUp={(e) => {
					if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
				}}
			/>
			<div className="chart-transport">
				<button aria-label="Rewind to title and axes" title="Rewind" onClick={() => void send({ action: "reset" })}>
					<SkipBackIcon size={18} />
				</button>
				<button aria-label={`Previous ${unit}`} title="Previous step" onClick={() => void send({ action: "previous" })}>
					<CaretLeftIcon size={18} />
				</button>
				<button className="primary" aria-label={playing ? "Pause" : "Play"} onClick={() => void send({ action: playing ? "pause" : "play" })}>
					{playing ? <PauseIcon size={20} weight="fill" /> : <PlayIcon size={20} weight="fill" />}
				</button>
				<button aria-label={`Next ${unit}`} title="Next step" onClick={() => void send({ action: "next" })}>
					<CaretRightIcon size={18} />
				</button>
				<button aria-label="Show all" title="Show all" onClick={() => void send({ action: "showAll" })}>
					<FastForwardIcon size={18} />
				</button>
			</div>
			{!anchor && <label className="chart-speed">
				Play speed
				<select
					value={speed}
					onChange={(e) =>
						void transport
							.request("chartUpdate", { id: chart.id, baseRevision: chart.revision, reveal: { ...chart.reveal, msPerStep: Number(e.target.value) } })
							.catch((err) => setError(String(err)))
					}
				>
					{[...new Set([400, 800, 1200, 2000, 3000, 5000, speed])].sort((a, b) => a - b).map((ms) => (
						<option key={ms} value={ms}>
							{(ms / 1000).toFixed(1)} s per {unit}
						</option>
					))}
				</select>
			</label>}
			{!anchor && <small>Next reveals one {unit}. Drag the slider back to hide data again. You can draw over the chart at any time. These controls never appear in the recording.</small>}
			{error && <output role="alert">{error}</output>}
		</aside>
	);
}
