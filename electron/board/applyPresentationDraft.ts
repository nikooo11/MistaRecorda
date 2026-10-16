import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { PresenterStore } from "./presenter";
import type { ChartStore } from "../charts/store";
import type { BoardState } from "../../src/types/board";
import type { PresentationJob } from "../../src/types/presentationDraft";
import type { TalkingNotes, PresenterLink } from "../../src/types/presenter";
import { emptyChartData } from "../../src/components/board/charts/chartModel";
export async function applyPresentationDraft(
	input: unknown,
	ctx: {
		job: PresentationJob;
		presenter: PresenterStore;
		charts: ChartStore;
		board: BoardState;
		sounds: { id: string }[];
	},
) {
	const { presenter, charts } = ctx;
	const request = z
		.object({
			id: z.string().uuid(),
			version: z.number().int(),
			mode: z.enum(["add", "replace", "new"]),
			name: z.string().trim().min(1).max(80),
			texts: z.array(z.string().min(1).max(1500)).max(20),
			excluded: z.array(z.string().max(30)).max(60),
		})
		.parse(input);
	const job = ctx.job;
	if (job.id !== request.id || job.phase !== "ready" || !job.draft)
		throw Error("Prepare or reopen the current AI draft first.");
	const draft = job.draft;
	if (request.version !== presenter.state.notesVersion || request.version !== draft.baseVersion)
		throw Error(
			"Notes changed since this draft was prepared. Copy your draft or prepare it again using the latest notes.",
		);
	if (request.texts.length !== draft.points.length) throw Error("Draft point count changed.");
	const notes: TalkingNotes = { body: "", references: {} };
	const links: PresenterLink[] = [];
	const createdCharts: string[] = [];
	try {
		const lines: string[] = [];
		for (const [i, point] of draft.points.entries()) {
			const tokens: string[] = [];
			for (const [j, suggestion] of point.suggestions.entries()) {
				if (request.excluded.includes(`${i}:${j}`)) continue;
				let ref: {
					kind: "image" | "meme" | "sound" | "chart" | "link";
					id: string;
				};
				if (suggestion.kind === "existing") {
					const [kind, id] = suggestion.target.split(":");
					const exists =
						kind === "image"
							? !!ctx.board.assets[id]
							: kind === "meme"
								? ctx.board.memes?.some((m) => m.id === id)
								: kind === "sound"
									? ctx.sounds.some((s) => s.id === id)
									: kind === "chart"
										? charts.charts.some((c) => c.id === id)
										: kind === "link" &&
											presenter.state.links.some((l) => l.id === id);
					if (!exists)
						throw Error("A suggested object was removed. Uncheck it and try again.");
					ref = { kind: kind as typeof ref.kind, id };
				} else if (suggestion.kind === "link") {
					const id = randomUUID();
					links.push({
						id,
						name: suggestion.label.slice(0, 80),
						url: suggestion.target,
						startAt: "url",
						target: "",
					});
					ref = { kind: "link", id };
				} else {
					const source = suggestion.chart;
					if (!source) continue;
					const data = emptyChartData(source.kind);
					data.title = suggestion.label;
					data.categories = source.labels;
					data.unit.suffix = source.unit;
					data.series = [
						{
							id: "s1",
							name: suggestion.label,
							color: "#4f8ef7",
							values: source.values.map((value) => ({
								value,
								confidence: "printed" as const,
							})),
						},
					];
					const chart = await charts.create(
						{
							name: suggestion.label.slice(0, 80),
							data,
							source: {
								notes: `PDF page ${point.page}. ${point.evidence}`.slice(0, 1000),
							},
						},
						"codex",
					);
					createdCharts.push(chart.id);
					ref = { kind: "chart", id: chart.id };
				}
				const token = `${ref.kind} ${suggestion.label} ${request.id.slice(0, 8)}-${i}-${j}`
					.replace(/[{}\n]/g, " ")
					.slice(0, 190);
				notes.references[token] = ref;
				tokens.push(`@{${token}}`);
			}
			lines.push(
				`- ${request.texts[i]} (PDF p. ${point.page})${tokens.length ? " · " + tokens.join(" ") : ""}`,
			);
		}
		notes.body = lines.join("\n");
		const next = await presenter.update("manageTalkingSets", {
			action: "apply",
			mode: request.mode,
			name: request.name,
			version: request.version,
			notes,
			links,
		});

		return next;
	} catch (error) {
		for (const id of createdCharts) await charts.remove(id);
		throw error;
	}
}
