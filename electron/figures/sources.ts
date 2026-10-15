import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import { z } from "zod";
import type { FigureSuggestion } from "../../src/types/figures";
import type { MemeAsset } from "../../src/types/memes";
export function publicURL(value: string) {
	const u = new URL(value);
	if (
		u.protocol !== "https:" ||
		u.username ||
		u.password ||
		(u.port && u.port !== "443") ||
		!u.hostname.includes(".") ||
		isIP(u.hostname.replace(/[[\]]/g, "")) ||
		/\.(local|localhost|internal|test|invalid)$/i.test(u.hostname)
	)
		throw Error("Use a public HTTPS source.");
	return u;
}
export function publicIPv4(ip: string) {
	const p = ip.split(".").map(Number);
	if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
	return !(
		p[0] === 0 ||
		p[0] === 10 ||
		p[0] === 127 ||
		p[0] >= 224 ||
		(p[0] === 169 && p[1] === 254) ||
		(p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
		(p[0] === 192 && [0, 168].includes(p[1])) ||
		(p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
		(p[0] === 198 && [18, 19, 51].includes(p[1])) ||
		(p[0] === 203 && p[1] === 0)
	);
}
const suggestion = z.object({
	title: z.string().min(1).max(160),
	kind: z.enum(["chart", "figure", "broll"]),
	summary: z.string().max(600),
	url: z.string().url().max(2048),
	source: z.string().max(120),
	imageUrl: z.string().url().max(2048).nullable(),
	usage: z.string().max(300),
	prompt: z.string().max(1500),
});
const memeSuggestion = z.object({
	kind: z.literal("meme"),
	memeId: z.string().uuid(),
	summary: z.string().min(1).max(600),
});
export function parseSuggestions(text: string, memes: MemeAsset[] = []): FigureSuggestion[] {
	const input = JSON.parse(
		text
			.trim()
			.replace(/^```(?:json)?\s*/, "")
			.replace(/\s*```$/, ""),
	);
	const seen = new Set<string>();
	return z
		.object({
			results: z
				.array(z.union([suggestion, memeSuggestion]))
				.min(1)
				.max(5)
				.refine(
					(items) =>
						items.filter((s) => s.kind !== "meme").length <= 3 &&
						items.filter((s) => s.kind === "meme").length <= 2,
				),
		})
		.parse(input)
		.results.flatMap((s, i): FigureSuggestion[] => {
			if (s.kind === "meme") {
				const asset = memes.find((m) => m.id === s.memeId);
				if (!asset || seen.has(asset.id)) return [];
				seen.add(asset.id);
				return [
					{
						id: String(i),
						kind: "meme",
						memeId: asset.id,
						title: asset.name,
						summary: s.summary,
						url: "",
						source: "Your meme library",
						imageUrl: null,
						usage: "Uses its saved sound and transitions. Tap to preview, then place.",
						prompt: "",
					},
				];
			}
			publicURL(s.url);
			if (s.imageUrl) publicURL(s.imageUrl);
			return [{ ...s, id: String(i) }];
		});
}
// Pin each HTTPS connection to a validated public address, including redirects.
export async function downloadFigure(
	value: string,
	signal: AbortSignal,
	redirects = 0,
): Promise<Buffer> {
	if (redirects > 3) throw Error("Too many image redirects.");
	const url = publicURL(value);
	const addresses = await lookup(url.hostname, { family: 4, all: true });
	if (!addresses.length || addresses.some((a) => !publicIPv4(a.address)))
		throw Error("The image source is not public.");
	return new Promise((resolve, reject) => {
		const req = https.get(
			url,
			{
				signal,
				timeout: 15000,
				lookup: (_host, _opts, cb) => cb(null, addresses[0].address, 4),
			},
			(res) => {
				if (
					[301, 302, 303, 307, 308].includes(res.statusCode ?? 0) &&
					res.headers.location
				) {
					res.resume();
					downloadFigure(
						new URL(res.headers.location, url).href,
						signal,
						redirects + 1,
					).then(resolve, reject);
					return;
				}
				if (
					res.statusCode !== 200 ||
					!/^image\/(png|jpeg|webp)(;|$)/i.test(String(res.headers["content-type"]))
				) {
					res.resume();
					reject(
						Error(
							"No downloadable image at this source. Open the Chrome link and use Capture Mac screen.",
						),
					);
					return;
				}
				let size = 0;
				const chunks: Buffer[] = [];
				res.on("data", (b: Buffer) => {
					size += b.length;
					if (size > 12 * 1024 * 1024) {
						req.destroy(Error("Image exceeds 12 MB."));
						return;
					}
					chunks.push(b);
				});
				res.on("end", () => resolve(Buffer.concat(chunks)));
				res.on("error", reject);
			},
		);
		req.on("timeout", () => req.destroy(Error("Image download timed out.")));
		req.on("error", reject);
	});
}
