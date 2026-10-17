import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { PresenterStore } from "./presenter";
const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});
async function store() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "presenter-test-"));
	dirs.push(dir);
	return new PresenterStore(dir);
}
test("notes, links and image settings persist separately without changing drawing state", async () => {
	const s = await store();
	const id = randomUUID();
	const notes = { body: "- **Jobs** @{Source}", references: { Source: { kind: "link", id } } };
	await s.update("saveTalkingNotes", { version: 0, notes });
	await s.update("savePresenterLink", {
		id,
		name: "Jobs report",
		url: "https://example.com",
		startAt: "text",
		target: "Employment",
	});
	await s.update("saveObjectPreference", {
		key: "image:chart",
		preference: { name: "Chart", widthPercent: 45 },
	});
	const loaded = new PresenterStore(s.root);
	await loaded.load();
	expect(loaded.state).toEqual(s.state);
	expect(await fs.readdir(s.root)).toEqual(["presenter.json"]);
	expect(loaded.link({ id })).toBe("https://example.com/#:~:text=Employment");
});
test("concurrent saves reject stale notes but preserve unrelated object changes", async () => {
	const s = await store();
	const id = randomUUID();
	const results = await Promise.allSettled([
		s.update("saveTalkingNotes", { version: 0, notes: { body: "Keep", references: {} } }),
		s.update("savePresenterLink", {
			id,
			name: "Source",
			url: "https://example.com",
			startAt: "url",
			target: "",
		}),
		s.update("saveTalkingNotes", { version: 0, notes: { body: "Stale", references: {} } }),
	]);
	expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "rejected"]);
	expect(s.state.notes.body).toBe("Keep");
	expect(s.state.links[0].id).toBe(id);
});
test("removed object references do not redirect to a new object with the same name", async () => {
	const s = await store();
	const id = randomUUID();
	await s.update("savePresenterLink", {
		id,
		name: "Source",
		url: "https://example.com",
		startAt: "url",
		target: "",
	});
	await s.update("saveTalkingNotes", {
		version: 0,
		notes: { body: "@{Source}", references: { Source: { kind: "link", id } } },
	});
	await s.update("removePresenterLink", id);
	await s.update("savePresenterLink", {
		id: randomUUID(),
		name: "Source",
		url: "https://example.org",
		startAt: "url",
		target: "",
	});
	expect(() => s.link({ id })).toThrow("removed");
	expect(s.state.notes.references.Source.id).toBe(id);
});
test("invalid settings and excessive notes never reach disk", async () => {
	const s = await store();
	await expect(
		s.update("savePresenterLink", {
			id: randomUUID(),
			name: "Bad",
			url: "javascript:alert(1)",
			startAt: "url",
			target: "",
		}),
	).rejects.toThrow();
	await expect(
		s.update("saveTalkingNotes", {
			version: 0,
			notes: { body: "a".repeat(40001), references: {} },
		}),
	).rejects.toThrow();
	await expect(
		s.update("saveObjectPreference", { key: "__proto__", preference: { widthPercent: 50 } }),
	).rejects.toThrow();
	await expect(
		s.update("saveObjectPreference", {
			key: "image:a",
			preference: { widthPercent: Infinity },
		}),
	).rejects.toThrow();
	expect(await fs.readdir(s.root)).toEqual([]);
});
test("a failed disk save keeps the previous version and permits a later retry", async () => {
	const parent = await store();
	const root = path.join(parent.root, "blocked");
	await fs.writeFile(root, "This file prevents the storage directory from being created.");
	const s = new PresenterStore(root);
	const original = structuredClone(s.state);
	const input = { version: 0, notes: { body: "Keep this draft", references: {} } };
	await expect(s.update("saveTalkingNotes", input)).rejects.toThrow();
	expect(s.state).toEqual(original);
	await fs.unlink(root);
	await s.update("saveTalkingNotes", input);
	const loaded = new PresenterStore(root);
	await loaded.load();
	expect(loaded.state.notes.body).toBe("Keep this draft");
	expect(loaded.state.notesVersion).toBe(1);
});

test("covered points and project/scene grouping survive reopening with stale-write protection", async () => {
	const s = await store();
	await s.update("saveTalkingNotes", {
		version: 0,
		notes: {
			body: "- Evidence",
			references: {},
			points: [{ id: "p", text: "- Evidence", covered: true }],
		},
	});
	await s.update("manageTalkingSets", {
		version: 1,
		action: "group",
		project: "Explainer",
		scene: "Evidence",
	});
	await expect(
		s.update("manageTalkingSets", { version: 1, action: "group", project: "Stale" }),
	).rejects.toThrow();
	const reopened = new PresenterStore(s.root);
	await reopened.load();
	expect(reopened.state.notes.points?.[0].covered).toBe(true);
	expect(reopened.state.noteSets?.[0]).toMatchObject({ project: "Explainer", scene: "Evidence" });
	expect(reopened.state.notesVersion).toBe(2);
});
