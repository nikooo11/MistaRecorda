import { expect, it, vi } from "vitest";
import { saveStandbySource } from "./standby";
import { emptyPresenterDocument } from "../../src/types/presenter";
it("saves a sourced suggestion privately, retaining context and reusing the existing link", async () => {
	const doc = emptyPresenterDocument();
	doc.links = [
		{
			id: "31ae19e2-ae40-44f3-95c0-7d42a000cae1",
			name: "Old",
			url: "https://example.com/report",
			startAt: "url",
			target: "",
		},
	];
	const save = vi.fn(async () => doc);
	await saveStandbySource(
		{
			id: "r",
			title: "Population trend",
			kind: "chart",
			url: doc.links[0].url,
			source: "Statistics Office",
			summary: "Compare the measured years.",
			usage: "Check reuse rights",
			imageUrl: null,
			prompt: "",
		},
		doc,
		save,
	);
	expect(save.mock.calls.map((c) => c[0])).toEqual(["savePresenterLink", "saveCanvasNote"]);
	expect(save.mock.calls[0][1]).toMatchObject({ id: doc.links[0].id });
	expect(save.mock.calls[1][1]).toMatchObject({
		text: expect.stringContaining("Statistics Office\nhttps://example.com/report"),
	});
});
it("rejects untrusted local URLs before saving", async () => {
	const save = vi.fn();
	await expect(
		saveStandbySource(
			{
				id: "r",
				title: "Bad",
				kind: "broll",
				url: "http://127.0.0.1/private",
				source: "",
				summary: "",
				usage: "",
				imageUrl: null,
				prompt: "",
			},
			emptyPresenterDocument(),
			save,
		),
	).rejects.toThrow();
	expect(save).not.toHaveBeenCalled();
});
