import { test, expect } from "vitest";
import { publicURL, publicIPv4, parseSuggestions } from "./sources";
test("rejects local, credential-bearing and executable source URLs", () => {
	for (const url of [
		"http://example.com",
		"https://localhost",
		"https://127.0.0.1",
		"https://[::1]",
		"https://printer.local",
		"https://name:secret@example.com",
		"https://example.com:8443",
		"file:///etc/passwd",
		"javascript:alert(1)",
	])
		expect(() => publicURL(url)).toThrow();
	expect(publicURL("https://www.bls.gov/charts/").hostname).toBe("www.bls.gov");
});
test("image fetch rejects private and reserved DNS addresses", () => {
	for (const ip of [
		"127.0.0.1",
		"10.0.0.1",
		"172.16.3.2",
		"192.168.1.1",
		"169.254.169.254",
		"100.64.1.1",
		"224.0.0.1",
		"::1",
	])
		expect(publicIPv4(ip)).toBe(false);
	expect(publicIPv4("8.8.8.8")).toBe(true);
});
test("suggestions require bounded, sourced fields and tolerate JSON fences", () => {
	const item = {
		title: "Employment",
		kind: "chart",
		summary: "Published monthly",
		url: "https://www.bls.gov",
		source: "BLS",
		imageUrl: null,
		usage: "Check source terms",
		prompt: "An illustrative workplace scene",
	};
	expect(
		parseSuggestions("```json\n" + JSON.stringify({ results: [item] }) + "\n```")[0].id,
	).toBe("0");
	expect(() =>
		parseSuggestions(JSON.stringify({ results: [{ ...item, url: "https://localhost" }] })),
	).toThrow();
	expect(() => parseSuggestions(JSON.stringify({ results: Array(4).fill(item) }))).toThrow();
});
