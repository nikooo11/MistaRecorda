import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type OpenAI from "openai";
import { z } from "zod";
import type { ChartDocument, ChartInfo, ChartJob, ChartPlayback } from "../../src/types/charts";
import {
	blockingIssues,
	CHART_LIMITS,
	chartDataSchema,
	chartDocumentSchema,
	chartImageSchema,
	newChartDocument,
	revealSteps,
} from "../../src/components/board/charts/chartModel";
import {
	applyPlayback,
	initialPlayback,
	type PlaybackCommand,
} from "../../src/components/board/charts/chartPlayback";
import { CHART_MODEL, extractChart, extractionError } from "./extract";

export const chartBundleSchema = z.object({
	charts: z.array(chartDocumentSchema).max(CHART_LIMITS.charts),
	sources: z.record(z.string().uuid(), chartImageSchema),
});
export type ChartBundle = z.infer<typeof chartBundleSchema>;
const sourceMeta = z
	.object({
		url: chartDocumentSchema.shape.source.shape.url,
		publisher: z.string().trim().max(120),
		published: z.string().trim().max(60),
		dateRange: z.string().trim().max(120),
		notes: z.string().trim().max(1000),
	})
	.partial();
const patchSchema = z.object({
	id: z.string().uuid(),
	baseRevision: z.number().int().nonnegative(),
	name: z.string().trim().min(1).max(80).optional(),
	status: z.enum(["draft", "reviewed"]).optional(),
	data: chartDataSchema.optional(),
	source: sourceMeta.optional(),
	reveal: chartDocumentSchema.shape.reveal.optional(),
	style: chartDocumentSchema.shape.style.optional(),
	resetToSource: z.boolean().optional(),
});
const createSchema = z.object({
	name: z.string().trim().min(1).max(80).optional(),
	data: chartDataSchema,
	source: sourceMeta.optional(),
	sourceImage: chartImageSchema.optional(),
});
const playbackSchema = z.object({
	id: z.string().uuid(),
	command: z.discriminatedUnion("action", [
		z.object({ action: z.enum(["play", "pause", "next", "previous", "reset", "showAll"]) }),
		z.object({ action: z.literal("seek"), position: z.number().finite() }),
	]),
});
export const analyzeSchema = z.object({
	jobId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
	dataURL: chartImageSchema,
	context: z.string().max(600).default(""),
	source: sourceMeta.default({}),
});
const idle = (): ChartJob => ({ phase: "idle", jobId: "", started: 0, error: "" });

/** Chart documents and screenshots persist on the Mac, separate from the scene: a slider
 * tick sends only a small playback record, never the chart, image or full board. */
export class ChartStore {
	charts: ChartDocument[] = [];
	playback: Record<string, ChartPlayback> = {};
	job: ChartJob = idle();
	private writes = Promise.resolve();
	private controller?: AbortController;
	private generation = 0;
	constructor(
		readonly root: string,
		private events: {
			charts: (info: ChartInfo) => void;
			playback: (p: ChartPlayback & { serverNow: number }) => void;
		},
		private openai: () => Promise<Pick<OpenAI, "responses">>,
		private hasKey: () => Promise<boolean> = async () => false,
		private now: () => number = Date.now,
	) {}
	private get dir() {
		return path.join(this.root, "charts");
	}
	private sourcePath(id: string) {
		return path.join(this.dir, "sources", `${z.string().uuid().parse(id)}.txt`);
	}
	async load() {
		const raw = await fs.readFile(path.join(this.dir, "charts.json"), "utf8").catch((e) => {
			if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw e;
		});
		if (!raw) return;
		const list = z
			.object({ version: z.literal(1), charts: z.array(z.unknown()) })
			.parse(JSON.parse(raw));
		// One damaged chart never prevents the rest of the presenter's charts from loading.
		this.charts = list.charts.flatMap((c) => {
			const parsed = chartDocumentSchema.safeParse(c);
			if (!parsed.success)
				console.error("[charts] Skipping invalid chart", parsed.error.issues[0]);
			return parsed.success ? [parsed.data as ChartDocument] : [];
		});
	}
	async info(): Promise<ChartInfo> {
		return {
			charts: this.charts,
			playback: this.playback,
			job: this.job,
			hasKey: await this.hasKey().catch(() => false),
			serverNow: this.now(),
		};
	}
	get(id: string) {
		const chart = this.charts.find((c) => c.id === id);
		if (!chart) throw Error("This chart was removed. Choose another chart.");
		return chart;
	}
	async source(id: string): Promise<string | null> {
		this.get(id);
		return fs.readFile(this.sourcePath(id), "utf8").catch(() => null);
	}
	private async commit(next: ChartDocument[], images: Record<string, string | null> = {}) {
		const operation = this.writes
			.catch(() => undefined)
			.then(async () => {
				if (next.length > CHART_LIMITS.charts)
					throw Error(
						`Up to ${CHART_LIMITS.charts} charts can be saved. Remove an unused chart first.`,
					);
				await fs.mkdir(path.join(this.dir, "sources"), { recursive: true });
				for (const [id, dataURL] of Object.entries(images)) {
					if (dataURL === null) await fs.rm(this.sourcePath(id), { force: true });
					else {
						const tmp = path.join(this.dir, "sources", `${randomUUID()}.tmp`);
						await fs.writeFile(tmp, dataURL, { mode: 0o600 });
						await fs.rename(tmp, this.sourcePath(id));
					}
				}
				const tmp = path.join(this.dir, `${randomUUID()}.tmp`);
				await fs.writeFile(tmp, JSON.stringify({ version: 1, charts: next }), {
					mode: 0o600,
				});
				await fs.rename(tmp, path.join(this.dir, "charts.json"));
				this.charts = next;
			});
		this.writes = operation;
		await operation;
		this.emit();
	}
	private emit() {
		void this.info().then(this.events.charts);
	}
	async create(input: unknown, actor: string) {
		const request = createSchema.parse(input);
		// Agent data is kept as the original for comparison. Every new chart starts as a
		// private draft; the presenter confirms it in review.
		const doc = newChartDocument(
			randomUUID(),
			request.data,
			actor === "codex" ? "mcp" : "manual",
			this.now(),
		);
		doc.status = "draft";
		if (request.name) doc.name = request.name;
		Object.assign(doc.source, request.source ?? {}, { hasImage: !!request.sourceImage });
		chartDocumentSchema.parse(doc);
		await this.commit(
			[...this.charts, doc],
			request.sourceImage ? { [doc.id]: request.sourceImage } : {},
		);
		return doc;
	}
	async update(input: unknown, actor: string) {
		const request = patchSchema.parse(input);
		const old = this.get(request.id);
		if (request.baseRevision !== old.revision)
			throw Error(
				"This chart changed on another device. Reopen it to see the latest version before saving.",
			);
		const next: ChartDocument = structuredClone(old);
		if (request.name) next.name = request.name;
		if (request.data) next.data = request.data;
		if (request.resetToSource) {
			if (!old.original) throw Error("This chart has no extracted source data to reset to.");
			next.data = structuredClone(old.original);
		}
		if (request.source) Object.assign(next.source, request.source);
		if (request.reveal) next.reveal = request.reveal;
		if (request.style) next.style = request.style;
		if (request.status) next.status = request.status;
		// An agent's edit always returns the chart to review.
		if (actor === "codex") next.status = "draft";
		if (next.status === "reviewed") {
			const errors = blockingIssues(next.data);
			if (errors.length) throw Error(`Fix before confirming: ${errors[0].message}`);
		}
		next.revision++;
		next.updated = this.now();
		chartDocumentSchema.parse(next);
		await this.commit(this.charts.map((c) => (c.id === next.id ? next : c)));
		// Keep playback within the new step count.
		const p = this.playback[next.id];
		if (p) {
			const steps = revealSteps(next.data, next.reveal.order);
			if (p.position > steps || p.target > steps)
				this.command({
					id: next.id,
					command: { action: "seek", position: Math.min(p.target, steps) },
				});
		}
		return next;
	}
	async remove(id: string) {
		this.get(id);
		delete this.playback[id];
		await this.commit(
			this.charts.filter((c) => c.id !== id),
			{ [id]: null },
		);
		return true;
	}
	command(input: unknown) {
		const request = playbackSchema.parse(input);
		const chart = this.get(request.id);
		const now = this.now();
		const steps = revealSteps(chart.data, chart.reveal.order);
		const old = this.playback[chart.id] ?? initialPlayback(chart.id, now);
		const next = applyPlayback(
			old,
			request.command as PlaybackCommand,
			steps,
			chart.reveal.msPerStep,
			now,
			chart.reveal.animate,
		);
		this.playback[chart.id] = next;
		this.events.playback({ ...next, serverNow: now });
		return next;
	}
	/** Recording pause freezes every chart at its current frame. */
	pauseAll() {
		for (const id of Object.keys(this.playback)) {
			const p = this.playback[id];
			if (p.position !== p.target && this.charts.some((c) => c.id === id))
				this.command({ id, command: { action: "pause" } });
		}
	}
	/** Reveal is explicit: an AI draft must be confirmed before it can be shown. */
	assertShowable(id: string) {
		const chart = this.get(id);
		if (chart.status !== "reviewed")
			throw Error(`Review and confirm “${chart.name}” before showing it on screen.`);
		const errors = blockingIssues(chart.data);
		if (errors.length) throw Error(`“${chart.name}” cannot be shown yet: ${errors[0].message}`);
	}
	analyze(input: unknown) {
		if (this.job.phase === "analyzing")
			throw Error("Finish or cancel the current chart analysis first.");
		const request = analyzeSchema.parse(input);
		const token = ++this.generation;
		const controller = new AbortController();
		this.controller = controller;
		this.job = { phase: "analyzing", jobId: request.jobId, started: this.now(), error: "" };
		this.emit();
		const timeout = setTimeout(() => controller.abort(), 120000);
		const done = (async () => {
			try {
				const client = await this.openai();
				const draft = await extractChart(
					client,
					{ dataURL: request.dataURL, context: request.context },
					controller.signal,
				);
				if (token !== this.generation) return;
				const doc = newChartDocument(randomUUID(), draft.data, "ai", this.now());
				doc.name = (draft.data.title || "Chart from screenshot").slice(0, 80);
				// Presenter-entered source details win, but blank fields never erase what the AI read.
				const typed = Object.fromEntries(
					Object.entries(request.source).filter(
						([, v]) => typeof v === "string" && v.trim(),
					),
				);
				Object.assign(doc.source, draft.source, typed, {
					model: CHART_MODEL,
					hasImage: true,
					warnings: draft.warnings,
				});
				chartDocumentSchema.parse(doc);
				await this.commit([...this.charts, doc], { [doc.id]: request.dataURL });
				if (token !== this.generation) return;
				this.job = {
					phase: "ready",
					jobId: request.jobId,
					started: this.job.started,
					error: "",
					chartId: doc.id,
				};
			} catch (e) {
				if (token !== this.generation) return;
				this.job = {
					phase: "error",
					jobId: request.jobId,
					started: this.job.started,
					error: extractionError(e, controller.signal.aborted),
				};
			} finally {
				clearTimeout(timeout);
				if (token === this.generation) this.emit();
			}
		})();
		return { job: this.job, done };
	}
	cancelAnalysis() {
		this.generation++;
		this.controller?.abort();
		this.job = idle();
		this.emit();
		return this.job;
	}
	async exportBundle(): Promise<ChartBundle> {
		await this.writes.catch(() => undefined);
		const sources: Record<string, string> = {};
		for (const c of this.charts)
			if (c.source.hasImage) {
				const image = await this.source(c.id);
				if (image) sources[c.id] = image;
			}
		return { charts: structuredClone(this.charts), sources };
	}
	/** Replace every chart, e.g. when loading an environment. Returns the previous bundle for rollback. */
	async replace(bundle: ChartBundle) {
		const valid = chartBundleSchema.parse(bundle);
		const previous = await this.exportBundle();
		const images: Record<string, string | null> = Object.fromEntries(
			previous.charts.map((c) => [c.id, null]),
		);
		for (const c of valid.charts) {
			c.source.hasImage = !!valid.sources[c.id];
			if (valid.sources[c.id]) images[c.id] = valid.sources[c.id];
		}
		this.playback = {};
		await this.commit(valid.charts as ChartDocument[], images);
		return previous;
	}
}
