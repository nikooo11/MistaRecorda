import { expect, test } from "vitest";
import { emptyBoardState } from "../../types/board";
import { emptyPresenterDocument } from "../../types/presenter";
import {
	linkDestination,
	mentionAt,
	noteParts,
	presenterId,
	presenterObjects,
	presenterURL,
	referenceToken,
} from "./presenterModel";

test("webpage starts at exact text, escaping fragment syntax rather than introducing another directive", () => {
	const url = linkDestination({
		id: "id",
		name: "Jobs",
		url: "https://example.com/news?year=2026#old",
		startAt: "text",
		target: "Jobs, wages - 2026 & tax",
	});
	expect(url).toBe(
		"https://example.com/news?year=2026#:~:text=Jobs%2C%20wages%20%2D%202026%20%26%20tax",
	);
	expect(
		linkDestination({
			id: "id",
			name: "Jobs",
			url: "https://example.com/news",
			startAt: "anchor",
			target: "#employment",
		}),
	).toBe("https://example.com/news#employment");
});
test("rejects executable URLs, local files and embedded credentials", () => {
	for (const url of [
		"javascript:alert(1)",
		"file:///etc/passwd",
		"data:text/html,hi",
		"https://user:password@example.com",
	])
		expect(() => presenterURL(url)).toThrow();
	expect(presenterURL("https://example.com").hostname).toBe("example.com");
});
test("notes render only the supported syntax, leaving HTML as text", () => {
	expect(
		noteParts("**Key point** @{Chart} [Source](https://example.com) <script>alert(1)</script>"),
	).toEqual([
		{ type: "bold", text: "Key point" },
		{ type: "text", text: " " },
		{ type: "reference", text: "Chart" },
		{ type: "text", text: " " },
		{ type: "link", text: "Source", url: "https://example.com/" },
		{ type: "text", text: " <script>alert(1)</script>" },
	]);
});
test("references stay attached to the right object after rename and disambiguate duplicate names", () => {
	const doc = emptyPresenterDocument();
	doc.notes = { body: "@{Chart}", references: { Chart: { kind: "image", id: "image1" } } };
	const state = emptyBoardState();
	state.assets.image1 = {
		id: "image1",
		dataURL: "data:image/png;base64,AA==",
		created: 1,
		mimeType: "image/png",
		name: "Renamed chart",
	};
	const obj = presenterObjects(state, doc, [])[0];
	expect(referenceToken(doc.notes, obj)).toBe("Chart");
	expect(obj.name).toBe("Renamed chart");
	expect(referenceToken(doc.notes, { ...obj, id: "image2", name: "Chart" })).toBe("Chart 2");
});
test("autocomplete detects a caret-local multiword mention without mistaking email addresses", () => {
	expect(mentionAt("- Discuss @Jobs graph", 21)).toEqual({ start: 10, query: "Jobs graph" });
	expect(mentionAt("contact@example.com", 19)).toBe(null);
	expect(mentionAt("@{Chart} next", 13)).toBe(null);
});
test("object UUIDs work on non-secure LAN pages without randomUUID", () => {
	expect(presenterId()).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
	);
});
