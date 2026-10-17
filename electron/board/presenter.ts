import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { emptyPresenterDocument, type PresenterDocument } from "../../src/types/presenter";
import { linkDestination, presenterURL } from "../../src/components/board/presenterModel";
const key = z
	.string()
	.min(1)
	.max(200)
	.refine((v) => !["__proto__", "constructor", "prototype"].includes(v));
const name = z.string().trim().min(1).max(80);
export const linkSchema = z
	.object({
		id: z.string().uuid(),
		name,
		url: z
			.string()
			.trim()
			.max(4096)
			.refine((v) => {
				try {
					presenterURL(v);
					return true;
				} catch {
					return false;
				}
			}, "Use an http or https webpage link."),
		startAt: z.enum(["url", "text", "anchor"]),
		target: z.string().trim().max(500),
	})
	.refine((v) => v.startAt === "url" || !!v.target, "Enter the text or section to jump to.");
export const notesSchema = z.object({
	body: z.string().max(40000),
	points: z
		.array(
			z.object({
				id: z.string().max(100),
				text: z.string().max(40000),
				covered: z.boolean(),
			}),
		)
		.max(1000)
		.optional(),
	references: z
		.record(
			key,
			z.object({
				kind: z.enum(["image", "meme", "sound", "link", "note", "chart"]),
				id: z.string().min(1).max(100),
			}),
		)
		.refine((r) => Object.keys(r).length <= 200),
});
const preferenceSchema = z.object({
	name: name.optional(),
	widthPercent: z.number().finite().min(5).max(100).optional(),
	shadow: z.boolean().optional(),
	enter: z.enum(["none", "fade", "spin", "fall"]).optional(),
});
export const canvasNoteSchema = z.object({
	id: z.string().uuid(),
	name,
	text: z.string().trim().min(1).max(10000),
});
export const pdfMetadataSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(120),
	pages: z.number().int().min(1).max(500),
	hash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const documentSchema = z.object({
	version: z.literal(1),
	notesVersion: z.number().int().nonnegative(),
	notes: notesSchema,
	links: z.array(linkSchema).max(200),
	preferences: z.record(key, preferenceSchema).refine((r) => Object.keys(r).length <= 500),
	canvasNotes: z.array(canvasNoteSchema).max(200).default([]),
	noteSets: z
		.array(
			z.object({
				id: z.string().min(1).max(100),
				name,
				notes: notesSchema,
				previous: notesSchema.optional(),
				project: z.string().max(120).optional(),
				scene: z.string().max(120).optional(),
			}),
		)
		.max(40)
		.optional(),
	activeSetId: z.string().max(100).optional(),
	pdfs: z.array(pdfMetadataSchema).max(10).default([]),
});
export function migrateNoteSets(doc: PresenterDocument) {
	if (!doc.noteSets?.length) {
		doc.noteSets = [
			{ id: "original", name: "My talking points", notes: structuredClone(doc.notes) },
		];
		doc.activeSetId = "original";
	}
	if (!doc.noteSets.some((s) => s.id === doc.activeSetId)) doc.activeSetId = doc.noteSets[0].id;
	return doc;
}
export class PresenterStore {
	state = migrateNoteSets(emptyPresenterDocument());
	private writes = Promise.resolve();
	constructor(readonly root: string) {}
	async load() {
		try {
			this.state = documentSchema.parse(
				JSON.parse(await fs.readFile(path.join(this.root, "presenter.json"), "utf8")),
			);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		migrateNoteSets(this.state);
	}
	async update(method: string, input: unknown): Promise<PresenterDocument> {
		// Serialize the entire read/validate/write transaction: a failed write never
		// publishes an in-memory state that was not durably saved.
		const operation = this.writes
			.catch(() => undefined)
			.then(async () => {
				const next = migrateNoteSets(structuredClone(this.state));
				const sets = next.noteSets!;
				const active = sets.find((s) => s.id === next.activeSetId)!;
				if (method === "saveTalkingNotes") {
					const data = z
						.object({ notes: notesSchema, version: z.number().int() })
						.parse(input);
					if (data.version !== next.notesVersion)
						throw Error(
							"Notes changed on another device. Reopen the saved version before saving.",
						);
					next.notes = data.notes;
					active.notes = data.notes;
					next.notesVersion++;
				} else if (method === "manageTalkingSets") {
					const data = z
						.object({
							action: z.enum([
								"new",
								"rename",
								"group",
								"duplicate",
								"delete",
								"select",
								"undo",
								"apply",
							]),
							version: z.number().int(),
							id: z.string().optional(),
							name: name.optional(),
							project: z.string().max(120).optional(),
							scene: z.string().max(120).optional(),
							notes: notesSchema.optional(),
							mode: z.enum(["add", "replace", "new"]).optional(),
							links: z.array(linkSchema).max(20).optional(),
						})
						.parse(input);
					if (data.version !== next.notesVersion)
						throw Error(
							"Talking points changed on another device. Refresh the saved notes before applying this draft.",
						);
					if (
						data.action === "new" ||
						data.action === "duplicate" ||
						(data.action === "apply" && data.mode === "new")
					) {
						const set = {
							id: randomUUID(),
							name: data.name ?? "New talking points",
							notes:
								data.action === "duplicate"
									? structuredClone(active.notes)
									: (data.notes ?? { body: "", references: {} }),
						};
						sets.push(set);
						next.activeSetId = set.id;
					} else if (data.action === "rename") active.name = data.name ?? active.name;
					else if (data.action === "group") {
						active.project = data.project;
						active.scene = data.scene;
					} else if (data.action === "select") {
						if (!sets.some((s) => s.id === data.id))
							throw Error("This note set was removed.");
						next.activeSetId = data.id;
					} else if (data.action === "delete") {
						if (sets.length === 1) throw Error("Keep at least one note set.");
						next.noteSets = sets.filter((s) => s.id !== active.id);
						next.activeSetId = next.noteSets[0].id;
					} else if (data.action === "undo") {
						if (!active.previous) throw Error("No AI changes to undo.");
						const old = active.notes;
						active.notes = active.previous;
						active.previous = old;
					} else if (data.action === "apply") {
						if (!data.notes || !data.mode) throw Error("Choose how to save the draft.");
						active.previous = structuredClone(active.notes);
						if (data.mode === "add") {
							for (const [token, ref] of Object.entries(data.notes.references)) {
								const existing = active.notes.references[token];
								if (
									existing &&
									(existing.id !== ref.id || existing.kind !== ref.kind)
								)
									throw Error(
										"An object name conflicts with existing notes. Save as a new set instead.",
									);
							}
							active.notes = {
								points: [
									...(active.notes.points ?? []),
									...(data.notes.points ?? []),
								],
								body: [active.notes.body, data.notes.body]
									.filter(Boolean)
									.join("\n"),
								references: {
									...active.notes.references,
									...data.notes.references,
								},
							};
						} else active.notes = data.notes;
					}
					for (const link of data.links ?? [])
						next.links = [...next.links.filter((l) => l.id !== link.id), link];
					next.notes = next.noteSets!.find((s) => s.id === next.activeSetId)!.notes;
					next.notesVersion++;
				} else if (method === "addPresenterPDF") {
					const pdf = pdfMetadataSchema.parse(input);
					next.pdfs = [...(next.pdfs ?? []).filter((p) => p.id !== pdf.id), pdf];
				} else if (method === "removePresenterPDF") {
					const id = z.string().uuid().parse(input);
					next.pdfs = (next.pdfs ?? []).filter((p) => p.id !== id);
				} else if (method === "saveCanvasNote") {
					const note = canvasNoteSchema.parse(input);
					next.canvasNotes = [
						...(next.canvasNotes ?? []).filter((n) => n.id !== note.id),
						note,
					];
				} else if (method === "replacePresentation") {
					Object.assign(next, migrateNoteSets(documentSchema.parse(input)), {
						notesVersion: next.notesVersion + 1,
					});
				} else if (method === "savePresenterLink") {
					const link = linkSchema.parse(input);
					next.links = [...next.links.filter((l) => l.id !== link.id), link];
				} else if (method === "removePresenterLink") {
					const id = z.string().uuid().parse(input);
					next.links = next.links.filter((l) => l.id !== id);
				} else if (method === "saveObjectPreference") {
					const data = z.object({ key, preference: preferenceSchema }).parse(input);
					next.preferences[data.key] = data.preference;
				} else throw Error("Unknown presenter action");
				documentSchema.parse(next);
				await fs.mkdir(this.root, { recursive: true });
				const temporary = path.join(this.root, `${randomUUID()}.tmp`);
				await fs.writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
				await fs.rename(temporary, path.join(this.root, "presenter.json"));
				this.state = next;
			});
		this.writes = operation;
		await operation;
		return this.state;
	}
	link(input: unknown) {
		const request = z
			.union([z.object({ id: z.string().uuid() }), z.object({ url: z.string().max(4096) })])
			.parse(input);
		if ("url" in request) return presenterURL(request.url).href;
		const link = this.state.links.find((l) => l.id === request.id);
		if (!link) throw Error("This link was removed. Choose another object.");
		return linkDestination(link);
	}
}
