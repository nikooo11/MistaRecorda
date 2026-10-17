import {insideCapture,captureSceneFrame} from '../../src/types/vertical';
import { z } from "zod";
import type { BoardElement } from "../../src/types/board";
import {
	chartElementProps,
	chartMeta,
	defaultChartSize,
} from "../../src/components/board/charts/chartModel";
import { isShadow, setShadow } from "../../src/components/board/shadowObjects";
import type { BoardStore } from "../board/store";
import { makeElement } from "../board/store";
import type { ChartStore } from "./store";

export const CHART_METHODS = [
	"chartInfo",
	"chartSource",
	"chartCreate",
	"chartUpdate",
	"chartRemove",
	"chartPlayback",
	"chartAnalyze",
	"chartCancel",
	"chartPlace",
] as const;

/** Showing a chart publicly is deliberate: drafts and invalid data stay private. */
export function assertChartReveal(
	charts: ChartStore,
	before: readonly BoardElement[],
	after: readonly BoardElement[],
) {
	const visible = new Set(
		before.filter((e) => !e.isDeleted && chartMeta(e) && !isShadow(e)).map((e) => e.id),
	);
	for (const e of after) {
		const meta = chartMeta(e);
		if (meta && !e.isDeleted && !isShadow(e) && !visible.has(e.id))
			charts.assertShowable(meta.chartId);
	}
}
/** Revealing shadow objects must not reveal a draft chart in the same group. */
export function assertChartIdsShowable(
	charts: ChartStore,
	elements: readonly BoardElement[],
	ids: ReadonlySet<string>,
) {
	for (const e of elements) {
		const meta = chartMeta(e);
		if (meta && ids.has(e.id) && !e.isDeleted) charts.assertShowable(meta.chartId);
	}
}

/** Revealing a chart starts the audience reveal from the title and axes. */
export function restartRevealedCharts(
	charts: ChartStore,
	elements: readonly BoardElement[],
	ids: ReadonlySet<string>,
) {
	const chartIds = new Set(
		elements
			.filter((e) => ids.has(e.id) && !e.isDeleted && isShadow(e))
			.map((e) => chartMeta(e)?.chartId)
			.filter((id): id is string => !!id),
	);
	for (const id of chartIds) charts.command({ id, command: { action: "reset" } });
}
/** Request handlers shared by the Mac app and tests. Platform capture lives in register.ts. */
export async function chartAction(
	method: string,
	input: unknown,
	actor: string,
	ctx: {
		charts: ChartStore;
		board: BoardStore;
		publish: (actor: string) => void;
		hasKey: () => Promise<boolean>;
		validImage?: (dataURL: string) => boolean;
	},
) {
	const { charts, board } = ctx;
	switch (method) {
		case "chartInfo":
			return charts.info();
		case "chartSource":
			return { dataURL: await charts.source(z.string().uuid().parse(input)) };
		case "chartCreate":
			return charts.create(input, actor);
		case "chartUpdate":
			return charts.update(input, actor);
		case "chartRemove":
			return charts.remove(z.string().uuid().parse(input));
		case "chartPlayback": {
			const request = z.object({ id: z.string().uuid() }).passthrough().parse(input);
			// Agents prepare charts; only a reviewed chart can be played by an agent.
			if (actor === "codex") charts.assertShowable(request.id);
			return charts.command(input);
		}
		case "chartAnalyze": {
			if (!(await ctx.hasKey()))
				throw Error(
					"Add your OpenAI API key in Drawing → Setup → AI figures on the Mac, or enter the values manually.",
				);
			const dataURL = z
				.object({ dataURL: z.string().max(16 * 1024 * 1024) })
				.parse(input).dataURL;
			if (ctx.validImage && !ctx.validImage(dataURL))
				throw Error("Choose a valid PNG, JPEG or WebP image.");
			return charts.analyze(input).job;
		}
		case "chartCancel":
			return charts.cancelAnalysis();
		case "chartPlace": {
			const request = z
				.object({
					chartId: z.string().uuid(),
					mode: z.enum(["screen", "board"]).optional(),
					x: z.number().finite().min(-1e6).max(1e6),
					y: z.number().finite().min(-1e6).max(1e6),
					width: z.number().finite().min(120).max(6000).optional(),
					height: z.number().finite().min(80).max(6000).optional(),
					shadow: z.boolean().default(true),
					revision: z.number().int().optional(),
				})
				.parse(input);
			const chart = charts.get(request.chartId);
			if (!request.shadow) charts.assertShowable(chart.id);
			if (request.revision !== undefined && request.revision !== board.state.revision)
				throw Error("The board changed. Try placing the chart again.");
			const mode = request.mode ?? board.state.mode;
			const scene = board.state.scenes[mode];
			const size = defaultChartSize(chart.data, request.width ?? board.state.width * 0.45);
			const rect={x:request.x,y:request.y,width:size.width,height:request.height??size.height};
			if(board.state.captureFrame)Object.assign(rect,insideCapture(rect,captureSceneFrame(board.state.captureFrame,scene)));
			const element = setShadow(
				{
					...makeElement({
						type: "rectangle",
						...rect,
					}),
					...chartElementProps(chart.id),
				},
				request.shadow,
				"none",
			);
			board.updateScene(
				mode,
				{ ...scene, elements: [...scene.elements, element] },
				board.state.revision,
			);
			ctx.publish(actor);
			return { state: board.state, elementId: element.id };
		}
	}
	throw Error("Unknown chart action");
}
