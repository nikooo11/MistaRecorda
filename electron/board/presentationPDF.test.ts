import { afterEach, expect, test, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type OpenAI from "openai";
import {
	PresentationPDFStore,
	PresentationPlanner,
	presentationRequestSchema,
	sanitizePresentationDraft,
	validatePDF,
} from "./presentationPDF";
import { PresenterStore } from "./presenter";
const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});
async function root() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-presentation-"));
	roots.push(dir);
	return dir;
}
const request = () => ({
	id: randomUUID(),
	pdfId: randomUUID(),
	baseVersion: 0,
	goal: "Explain",
	audience: "General",
	minutes: 5,
	pages: [{ page: 1, text: "January 10 February 20. Source https://example.com/report" }],
	memes: true,
	sounds: false,
	research: false,
});
const raw = () => ({
	title: "Trend",
	recommendation: "Add to preserve notes",
	warnings: [],
	points: [
		{
			text: "Compare the two months",
			page: 1,
			evidence: "January 10 February 20",
			suggestions: [
				{
					kind: "chart",
					label: "Monthly totals",
					target: "",
					chart: {
						kind: "bar",
						labels: ["January", "February"],
						values: [10, 20],
						unit: "",
					},
				},
			],
		},
	],
});
test("PDF storage validates size and signature and portable restore validates hashes", async () => {
	const store = new PresentationPDFStore(await root());
	const data = Buffer.from("%PDF-1.7\nQA fixture").toString("base64");
	const meta = await store.import({ name: "QA.pdf", pages: 2, data });
	expect(await store.read(meta.id)).toBe(data);
	const other = new PresentationPDFStore(await root());
	await other.restore(await store.bundle([meta]), [meta]);
	expect(await other.read(meta.id)).toBe(data);
	await expect(
		other.restore({ [meta.id]: Buffer.from("%PDF-different").toString("base64") }, [meta]),
	).rejects.toThrow("damaged");
	expect(() => validatePDF(Buffer.from("not a pdf").toString("base64"))).toThrow();
	await expect(store.read("../../secrets")).rejects.toThrow();
});
test("legacy notes migrate, sets persist independently, apply and undo are version guarded", async () => {
	const dir = await root();
	await fs.writeFile(
		path.join(dir, "presenter.json"),
		JSON.stringify({
			version: 1,
			notesVersion: 8,
			notes: { body: "Keep original", references: {} },
			links: [],
			preferences: {},
		}),
	);
	const store = new PresenterStore(dir);
	await store.load();
	expect(store.state.noteSets?.[0].notes.body).toBe("Keep original");
	await store.update("manageTalkingSets", { action: "duplicate", name: "Second", version: 8 });
	await store.update("manageTalkingSets", {
		action: "apply",
		mode: "replace",
		notes: { body: "Draft replacement", references: {} },
		version: 9,
	});
	expect(store.state.notes.body).toBe("Draft replacement");
	await expect(
		store.update("manageTalkingSets", {
			action: "apply",
			mode: "replace",
			notes: { body: "Stale", references: {} },
			version: 9,
		}),
	).rejects.toThrow("changed");
	await store.update("manageTalkingSets", { action: "undo", version: 10 });
	expect(store.state.notes.body).toBe("Keep original");
	await store.update("saveTalkingNotes", {
		version: 11,
		notes: { body: "Second edited", references: {} },
	});
	await store.update("manageTalkingSets", { action: "select", id: "original", version: 12 });
	expect(store.state.notes.body).toBe("Keep original");
	const loaded = new PresenterStore(dir);
	await loaded.load();
	expect(loaded.state.noteSets?.[1].notes.body).toBe("Second edited");
});
test("drafts discard invented IDs, URLs and chart numbers and reject wrong page citations", () => {
	const r = raw();
	r.points[0].suggestions.push(
		{ kind: "existing", label: "Invented", target: "meme:missing", chart: null } as never,
		{
			kind: "link",
			label: "Fake source",
			target: "https://wrong.example",
			chart: null,
		} as never,
	);
	const valid = sanitizePresentationDraft(r, request(), []);
	expect(valid.points[0].suggestions).toHaveLength(1);
	r.points[0].suggestions[0].chart.values = [10, 900];
	expect(sanitizePresentationDraft(r, request(), []).points[0].suggestions).toHaveLength(0);
	r.points[0].page = 10;
	expect(() => sanitizePresentationDraft(r, request(), [])).toThrow("outside");
	expect(() =>
		presentationRequestSchema.parse({
			...request(),
			pages: Array.from({ length: 13 }, (_, i) => ({ page: i + 1, text: "" })),
		}),
	).toThrow();
});
test("planner makes one bounded call, excludes sounds by default, caches drafts and cancellation prevents late results", async () => {
	const create = vi
		.fn()
		.mockResolvedValue({ status: "completed", output_text: JSON.stringify(raw()) });
	const client = { responses: { create } } as unknown as Pick<OpenAI, "responses">;
	const planner = new PresentationPlanner(async () => client, vi.fn());
	const input = request();
	planner.start(input, [{ key: "sound:private", name: "Sound" }], "Keep");
	await vi.waitFor(() => expect(planner.job.phase).toBe("ready"));
	expect(create).toHaveBeenCalledTimes(1);
	const payload = create.mock.calls[0][0];
	expect(payload.store).toBe(false);
	expect(payload.max_output_tokens).toBe(6000);
	expect(JSON.stringify(payload)).not.toContain("sound:private");
	planner.start(
		{ ...input, id: randomUUID() },
		[{ key: "sound:private", name: "Sound" }],
		"Keep",
	);
	expect(create).toHaveBeenCalledTimes(1);
	expect(planner.job.message).toContain("cached");
	let resolve!: (value: unknown) => void;
	create.mockImplementation(
		() =>
			new Promise((r) => {
				resolve = r;
			}),
	);
	planner.start({ ...input, id: randomUUID(), goal: "Different" }, [], "");
	await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
	planner.cancel();
	resolve({ status: "completed", output_text: JSON.stringify(raw()) });
	await new Promise((r) => setTimeout(r, 5));
	expect(planner.job.phase).toBe("idle");
});

test("applying a reviewed draft creates standby references atomically and a stale apply cannot overwrite notes", async () => {
	const { applyPresentationDraft } = await import("./applyPresentationDraft");
	const { ChartStore } = await import("../charts/store");
	const { emptyBoardState } = await import("../../src/types/board");
	const dir = await root(),
		presenter = new PresenterStore(dir);
	const charts = new ChartStore(dir, { charts: () => {}, playback: () => {} }, async () => {
		throw Error("No API in apply");
	});
	const input = request();
	const draft = sanitizePresentationDraft(raw(), input, []);
	const ctx = {
		job: { id: input.id, phase: "ready" as const, message: "", draft },
		presenter,
		charts,
		board: emptyBoardState(),
		sounds: [],
	};
	const args = {
		id: input.id,
		version: 0,
		mode: "replace",
		name: "Trend",
		texts: ["Compare months"],
		excluded: [],
	};
	await applyPresentationDraft(args, ctx);
	expect(charts.charts).toHaveLength(1);
	expect(charts.charts[0].status).toBe("draft");
	expect(presenter.state.notes.body).toContain("@{chart Monthly totals");
	expect(presenter.state.notesVersion).toBe(1);
	await expect(applyPresentationDraft(args, ctx)).rejects.toThrow("Notes changed");
	expect(charts.charts).toHaveLength(1);
	await presenter.update("manageTalkingSets", { action: "undo", version: 1 });
	expect(presenter.state.notes.body).toBe("");
});

test("charts require whole printed numbers and research links must come from returned sources", () => {
	const input = request();
	input.pages[0].text = "January 100 February 200";
	expect(sanitizePresentationDraft(raw(), input, []).points[0].suggestions).toEqual([]);
	const draft = raw();
	draft.points[0].suggestions = [
		{
			kind: "link",
			label: "Supporting source",
			target: "https://example.com/research",
			chart: null,
		} as never,
	];
	expect(sanitizePresentationDraft(draft, input, []).points[0].suggestions).toEqual([]);
	expect(
		sanitizePresentationDraft(draft, input, [], ["https://example.com/research"]).points[0]
			.suggestions,
	).toHaveLength(1);
});
