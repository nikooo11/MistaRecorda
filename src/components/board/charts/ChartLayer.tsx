import { memo } from "react";
import type { BoardElement } from "../../../types/board";
import type { ChartDocument } from "../../../types/charts";
import { chartMeta, revealSteps } from "./chartModel";
import { renderedReveal, revealAt } from "./chartPlayback";
import { renderChartSvg } from "./chartRender";
import { isShadow } from "../shadowObjects";
import type { ChartsState } from "./useCharts";

const ChartSvg = memo(function ChartSvg({
	chart,
	width,
	height,
	reveal,
	id,
}: {
	chart: ChartDocument;
	width: number;
	height: number;
	reveal: number;
	id: string;
}) {
	return (
		<div
			className="chart-svg"
			// The renderer escapes every label; this markup never contains controls.
			dangerouslySetInnerHTML={{ __html: renderChartSvg(chart, { width, height, reveal, idPrefix: id }) }}
		/>
	);
});

/** Charts render beneath the ink so annotations stay on top. Elements arrive already
 * filtered by visibleElements(): shadows are absent from clean output and 50% on the iPad. */
export function ChartLayer({
	elements,
	charts,
	now,
	view,
	tablet,
	hidePublic,
}: {
	elements: readonly BoardElement[];
	charts: ChartsState;
	now: number;
	view: { x: number; y: number; zoom: number };
	tablet: boolean;
	/** The streamed iPad preview already shows public charts inside the video. */
	hidePublic: boolean;
}) {
	return (
		<div
			className="chart-layer"
			aria-hidden={!tablet}
			style={{ transform: `scale(${view.zoom}) translate(${view.x}px, ${view.y}px)` }}
		>
			{elements.map((e) => {
				const meta = chartMeta(e);
				if (!meta || e.isDeleted) return null;
				const shadow = isShadow(e);
				if (hidePublic && !shadow) return null;
				const chart = charts.charts.find((c) => c.id === meta.chartId);
				const w = Math.max(1, Math.abs(Number(e.width))),
					h = Math.max(1, Math.abs(Number(e.height)));
				const style = {
					left: Number(e.x),
					top: Number(e.y),
					width: w,
					height: h,
					opacity: Math.max(0, Math.min(100, Number(e.opacity ?? 100))) / 100,
					transform: e.angle ? `rotate(${Number(e.angle)}rad)` : undefined,
				};
				if (!chart)
					return tablet ? (
						<div key={e.id} className="chart-object chart-missing" style={style}>
							Chart unavailable · remove or replace it
						</div>
					) : null;
				const steps = revealSteps(chart.data, chart.reveal.order);
				// A shadow chart is private: the iPad shows its end frame so the presenter knows
				// the whole chart before presenting. The audience reveal starts when shown.
				const reveal = shadow
					? steps
					: renderedReveal(revealAt(charts.playback[chart.id], now, steps), chart.reveal.animate);
				const id = `c${e.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 16)}`;
				return (
					<div
						key={e.id}
						className={`chart-object ${shadow ? "is-shadow" : ""}`}
						data-chart-id={chart.id}
						data-chart-reveal={reveal.toFixed(3)}
						style={style}
					>
						<ChartSvg chart={chart} width={w} height={h} reveal={reveal} id={id} />
						{tablet && !shadow && reveal < steps && (
							// Private look-ahead of the data still to come; only the iPad renders it.
							<div className="chart-ghost">
								<ChartSvg chart={chart} width={w} height={h} reveal={steps} id={`${id}g`} />
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
