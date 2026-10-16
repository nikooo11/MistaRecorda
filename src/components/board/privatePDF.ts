import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerURL from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFPageInput } from "../../types/presentationDraft";
GlobalWorkerOptions.workerSrc = workerURL;
export function openPrivatePDF(bytes: Uint8Array) {
	return getDocument({
		data: bytes,
		cMapUrl: new URL("/pdfjs/cmaps/", window.location.href).href,
		cMapPacked: true,
		standardFontDataUrl: new URL("/pdfjs/standard_fonts/", window.location.href).href,
		wasmUrl: new URL("/pdfjs/wasm/", window.location.href).href,
		enableXfa: false,
		disableFontFace: false,
	}).promise;
}
const textCache = new WeakMap<PDFDocumentProxy, Map<number, string>>();
export async function pdfText(pdf: PDFDocumentProxy, page: number) {
	const cached = textCache.get(pdf)?.get(page);
	if (cached !== undefined) return cached;
	const p = await pdf.getPage(page);
	const content = await p.getTextContent();
	const text = content.items
		.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : " ") : ""))
		.join("");
	const links = (await p.getAnnotations()).flatMap((a) =>
		typeof a.url === "string" && /^https?:\/\//i.test(a.url) ? [a.url] : [],
	);
	const result = [text, ...links].join("\n");
	const cache = textCache.get(pdf) ?? new Map<number, string>();
	cache.set(page, result);
	textCache.set(pdf, cache);
	return result;
}
export function selectedPDFPages(value: string, total: number): number[] {
	const result = new Set<number>();
	for (const segment of value.split(",")) {
		const match = segment.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
		if (!match) throw Error("Enter pages such as 1-4, 7.");
		const from = Number(match[1]),
			to = Number(match[2] ?? match[1]);
		if (from < 1 || to > total || to < from || to - from > 11)
			throw Error("Choose up to 12 valid PDF pages at a time.");
		for (let p = from; p <= to; p++) result.add(p);
	}
	if (!result.size || result.size > 12) throw Error("Choose up to 12 pages at a time.");
	return [...result].sort((a, b) => a - b);
}
export async function extractPDFPages(
	pdf: PDFDocumentProxy,
	pages: number[],
	ocr: boolean,
	progress: (s: string) => void,
): Promise<PDFPageInput[]> {
	const result: PDFPageInput[] = [];
	let images = 0;
	for (const number of pages) {
		progress(`Reading PDF page ${number}…`);
		const text = (await pdfText(pdf, number)).slice(0, 12000);
		const entry: PDFPageInput = { page: number, text };
		if (text.trim().length < 40) {
			if (!ocr)
				throw Error(
					`Page ${number} is scanned. Enable “Read scanned pages” or select text pages.`,
				);
			if (++images > 3)
				throw Error("Choose no more than three scanned pages per draft to control cost.");
			const page = await pdf.getPage(number),
				viewport = page.getViewport({ scale: 1 });
			const scaled = page.getViewport({
				scale: Math.min(1.7, 1500 / Math.max(viewport.width, viewport.height)),
			});
			const canvas = document.createElement("canvas");
			canvas.width = Math.ceil(scaled.width);
			canvas.height = Math.ceil(scaled.height);
			await page.render({ canvas, viewport: scaled }).promise;
			entry.image = canvas.toDataURL("image/jpeg", 0.8);
			canvas.width = canvas.height = 0;
		}
		result.push(entry);
	}
	return result;
}
