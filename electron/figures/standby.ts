import { randomUUID } from "node:crypto";
import type { FigureSuggestion } from "../../src/types/figures";
import type { PresenterDocument } from "../../src/types/presenter";
import { publicURL } from "./sources";
/** Store the source and its context privately. This path has no deploy/browser capability. */
export async function saveStandbySource(
	result: FigureSuggestion,
	document: PresenterDocument,
	save: (method: string, input: unknown) => Promise<PresenterDocument>,
) {
	const url = publicURL(result.url).href;
	const name = (result.title.trim() || "Suggested source").slice(0, 80);
	const existing = document.links.find((l) => l.url === url);
	const id = existing?.id ?? randomUUID();
	await save("savePresenterLink", { id, name, url, startAt: "url", target: "" });
	return save("saveCanvasNote", {
		id,
		name: ("Context: " + name).slice(0, 80),
		text: [
			result.summary,
			result.source,
			url,
			result.usage,
			"AI suggestion — check the source before presenting.",
		]
			.filter(Boolean)
			.join("\n")
			.slice(0, 10000),
	});
}
