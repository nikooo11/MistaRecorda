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
const notesSchema = z.object({
	body: z.string().max(40000),
	references: z
		.record(
			key,
			z.object({
				kind: z.enum(["image", "meme", "sound", "link", "note"]),
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
export const documentSchema = z.object({
	version: z.literal(1),
	notesVersion: z.number().int().nonnegative(),
	notes: notesSchema,
	links: z.array(linkSchema).max(200),
	preferences: z.record(key, preferenceSchema).refine((r) => Object.keys(r).length <= 500),
	canvasNotes: z.array(canvasNoteSchema).max(200).default([]),
});
export class PresenterStore {
	state = emptyPresenterDocument();
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
	}
	async update(method: string, input: unknown): Promise<PresenterDocument> {
		// Serialize the entire read/validate/write transaction: a failed write never
		// publishes an in-memory state that was not durably saved.
		const operation = this.writes
			.catch(() => undefined)
			.then(async () => {
				const next = structuredClone(this.state);
				if (method === "saveTalkingNotes") {
					const data = z
						.object({ notes: notesSchema, version: z.number().int() })
						.parse(input);
					if (data.version !== next.notesVersion)
						throw Error(
							"Notes changed on another device. Reopen the saved version before saving.",
						);
					next.notes = data.notes;
					next.notesVersion++;
				} else if (method === "saveCanvasNote") {
					const note = canvasNoteSchema.parse(input);
					next.canvasNotes = [
						...(next.canvasNotes ?? []).filter((n) => n.id !== note.id),
						note,
					];
				} else if (method === "replacePresentation") {
					Object.assign(next, documentSchema.parse(input), {
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
