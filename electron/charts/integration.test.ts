import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { emptyBoardState } from "../../src/types/board";
import { emptyPresenterDocument } from "../../src/types/presenter";
import { emptyChartData } from "../../src/components/board/charts/chartModel";
import {
	setShadow,
	shadowSelectionIds,
	visibleElements,
} from "../../src/components/board/shadowObjects";
import { presenterObjects } from "../../src/components/board/presenterModel";
import { BoardStore, makeElement, validateScene } from "../board/store";
import { validatePresentationBundle } from "../board/presentationBundle";
import {
	assertChartIdsShowable,
	assertChartReveal,
	chartAction,
	restartRevealedCharts,
} from "./actions";
import { ChartStore } from "./store";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});
async function setup() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chart-int-"));
	dirs.push(dir);
	const board = new BoardStore(dir);
	const charts = new ChartStore(
		dir,
		{ charts: () => undefined, playback: () => undefined },
		async () => {
			throw Error("no network in tests");
		},
	);
	const published: string[] = [];
	const ctx = {
		charts,
		board,
		publish: (a: string) => published.push(a),
		hasKey: async () => false,
	};
	const data = emptyChartData("bar");
	data.title = "Visits";
	data.series[0].values = data.series[0].values.map((_, i) => ({
		value: (i + 1) * 10,
		confidence: "manual" as const,
	}));
	const chart = await charts.create({ data }, "ipad");
	return { board, charts, ctx, chart, published };
}

test("charts are placed as private shadow objects and drafts cannot be revealed", async () => {
	const { board, charts, ctx, chart } = await setup();
	const placed = (await chartAction(
		"chartPlace",
		{ chartId: chart.id, mode: "board", x: 10, y: 20 },
		"ipad",
		ctx,
	)) as { elementId: string };
	const element = board.state.scenes.board.elements.find((e) => e.id === placed.elementId)!;
	expect(element).toMatchObject({
		type: "rectangle",
		opacity: 50,
		customData: { chart: { chartId: chart.id }, presentation: { shadow: true } },
	});
	expect(board.state.scenes.screen.elements).toEqual([]);
	// Clean output (Mac overlay and recording) never receives the shadow chart.
	expect(visibleElements(board.state.scenes.board.elements, false, Date.now())).toEqual([]);
	expect(visibleElements(board.state.scenes.board.elements, true)).toHaveLength(1);
	await expect(
		chartAction("chartPlace", { chartId: chart.id, x: 0, y: 0, shadow: false }, "ipad", ctx),
	).rejects.toThrow(/Review and confirm/);
	const revealed = board.state.scenes.board.elements.map((e) => setShadow(e, false));
	expect(() => assertChartReveal(charts, board.state.scenes.board.elements, revealed)).toThrow(
		/Review and confirm/,
	);
	await charts.update({ id: chart.id, baseRevision: 0, status: "reviewed" }, "ipad");
	expect(() =>
		assertChartReveal(charts, board.state.scenes.board.elements, revealed),
	).not.toThrow();
	await expect(
		chartAction(
			"chartPlace",
			{ chartId: chart.id, x: 0, y: 0, shadow: false, revision: -5 },
			"ipad",
			ctx,
		),
	).rejects.toThrow(/board changed/);
});

test("group reveal includes grouped chart members and checks every chart", async () => {
	const { board, charts, ctx, chart } = await setup();
	const placed = (await chartAction(
		"chartPlace",
		{ chartId: chart.id, mode: "screen", x: 0, y: 0 },
		"ipad",
		ctx,
	)) as { elementId: string };
	const label = setShadow(makeElement({ type: "text", id: "label", text: "Look here" }), true);
	board.state.scenes.screen.elements = board.state.scenes.screen.elements.map((e) => ({
		...e,
		groupIds: ["g"],
	}));
	board.state.scenes.screen.elements.push({ ...label, groupIds: ["g"] });
	const ids = shadowSelectionIds(board.state.scenes.screen.elements, ["label"]);
	expect([...ids].sort()).toEqual([placed.elementId, "label"].sort());
	expect(() => assertChartIdsShowable(charts, board.state.scenes.screen.elements, ids)).toThrow(
		/Review and confirm/,
	);
	await charts.update({ id: chart.id, baseRevision: 0, status: "reviewed" }, "ipad");
	expect(() =>
		assertChartIdsShowable(charts, board.state.scenes.screen.elements, ids),
	).not.toThrow();
	// Scrubbing while private does not leak: revealing restarts from title and axes.
	charts.command({ id: chart.id, command: { action: "showAll" } });
	restartRevealedCharts(charts, board.state.scenes.screen.elements, ids);
	expect(charts.playback[chart.id]).toMatchObject({ position: 0, target: 0 });
});

test("scene validation keeps chart carriers invisible whatever style is applied", async () => {
	const { board, ctx, chart } = await setup();
	await chartAction("chartPlace", { chartId: chart.id, mode: "board", x: 0, y: 0 }, "ipad", ctx);
	const [carrier] = board.state.scenes.board.elements;
	const styled = validateScene({
		...board.state.scenes.board,
		elements: [
			{
				...carrier,
				backgroundColor: "#ff0000",
				strokeColor: "#000000",
				fillStyle: "hachure",
			},
		],
	});
	expect(styled.elements[0]).toMatchObject({
		backgroundColor: "#ffffff01",
		strokeColor: "transparent",
		fillStyle: "solid",
	});
});
test("scene validation rejects malformed chart carriers", () => {
	const bad = { ...makeElement({ type: "ellipse" }), customData: { chart: { chartId: "x" } } };
	expect(() =>
		validateScene({ elements: [bad], files: {}, scrollX: 0, scrollY: 0, zoom: 1 }),
	).toThrow(/Invalid chart/);
});

test("agents get drafts, and only reviewed charts can be played by an agent", async () => {
	const { charts, ctx, chart } = await setup();
	const agent = (await chartAction(
		"chartCreate",
		{ data: emptyChartData("line") },
		"codex",
		ctx,
	)) as { status: string; source: { method: string } };
	expect(agent).toMatchObject({ status: "draft", source: { method: "mcp" } });
	await expect(
		chartAction("chartPlayback", { id: chart.id, command: { action: "play" } }, "codex", ctx),
	).rejects.toThrow(/Review and confirm/);
	expect(
		await chartAction(
			"chartPlayback",
			{ id: chart.id, command: { action: "next" } },
			"ipad",
			ctx,
		),
	).toMatchObject({ seq: 1 });
	await expect(
		chartAction(
			"chartAnalyze",
			{ jobId: "abcdef", dataURL: "data:image/png;base64,AA==" },
			"ipad",
			ctx,
		),
	).rejects.toThrow(/OpenAI API key/);
	expect(charts.charts).toHaveLength(2);
});

test("charts appear as presenter objects with stable IDs", async () => {
	const { chart } = await setup();
	const objects = presenterObjects(emptyBoardState(), emptyPresenterDocument(), [], [chart]);
	expect(objects).toEqual([
		expect.objectContaining({ kind: "chart", id: chart.id, name: "Visits", shadow: true }),
	]);
	expect(objects[0].preview).toMatch(/^data:image\/svg\+xml/);
});

test("environments round-trip chart objects; old environments still load; dangling charts are rejected", async () => {
	const { board, charts, ctx, chart } = await setup();
	await chartAction("chartPlace", { chartId: chart.id, mode: "board", x: 1, y: 2 }, "ipad", ctx);
	const bundle = {
		format: "mistarecorda-presentation",
		version: 1,
		name: "Charts",
		board: { ...board.state },
		presenter: emptyPresenterDocument(),
		sounds: [],
		charts: await charts.exportBundle(),
	};
	const parsed = validatePresentationBundle(JSON.parse(JSON.stringify(bundle)));
	expect(parsed.charts?.charts[0].id).toBe(chart.id);
	expect(parsed.board.scenes.board.elements[0].customData).toMatchObject({
		chart: { chartId: chart.id },
	});
	const { charts: _omit, ...old } = bundle;
	const legacy = {
		...old,
		board: {
			...old.board,
			scenes: {
				screen: old.board.scenes.screen,
				board: { ...old.board.scenes.board, elements: [] },
			},
		},
	};
	expect(validatePresentationBundle(JSON.parse(JSON.stringify(legacy))).charts).toBeUndefined();
	expect(() => validatePresentationBundle(JSON.parse(JSON.stringify(old)))).toThrow(
		/missing chart/,
	);
	// A chart on an inactive saved whiteboard tab still needs its chart data.
	const chartElement = parsed.board.scenes.board.elements[0];
	const tabbed = {
		...old,
		board: {
			...legacy.board,
			whiteboards: [
				{
					id: "default",
					name: "Whiteboard 1",
					scene: legacy.board.scenes.board,
					memes: [],
				},
				{
					id: "second",
					name: "Whiteboard 2",
					scene: { ...legacy.board.scenes.board, elements: [chartElement] },
					memes: [],
				},
			],
			activeWhiteboardId: "default",
		},
	};
	expect(() => validatePresentationBundle(JSON.parse(JSON.stringify(tabbed)))).toThrow(
		/missing chart/,
	);
	expect(
		validatePresentationBundle(JSON.parse(JSON.stringify({ ...tabbed, charts: bundle.charts })))
			.charts?.charts,
	).toHaveLength(1);
});
