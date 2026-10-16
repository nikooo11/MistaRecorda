import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	type BoardElement,
	type BoardScene,
	type BoardState,
	emptyBoardScene,
	emptyBoardState,
} from "../../src/types/board";
import { whiteboardPages } from "../../src/components/board/whiteboards";
import { validateMemes } from "./memes";
import { normalizeChartCarrier } from "../../src/components/board/charts/chartModel";
import { isShadow, presentationMeta, setShadow } from "../../src/components/board/shadowObjects";

const kinds = new Set([
	"rectangle",
	"ellipse",
	"diamond",
	"line",
	"arrow",
	"freedraw",
	"text",
	"image",
	"frame",
	"magicframe",
	"embeddable",
]);
export function validateScene(input: unknown): BoardScene {
	const s = input as BoardScene;
	if (
		!s ||
		!Array.isArray(s.elements) ||
		s.elements.length > 10000 ||
		!s.files ||
		typeof s.files !== "object"
	)
		throw Error("Invalid scene");
	for (const e of s.elements) {
		const meta = presentationMeta(e);
		if (
			meta &&
			(typeof meta.shadow !== "boolean" ||
				!Number.isFinite(meta.publicOpacity) ||
				meta.publicOpacity < 0 ||
				meta.publicOpacity > 100 ||
				!["none", "fade", "spin", "fall"].includes(meta.enter) ||
				(meta.revealedAt !== undefined && !Number.isFinite(meta.revealedAt)))
		)
			throw Error("Invalid shadow object settings");
		if (
			!e ||
			typeof e.id !== "string" ||
			e.id.length > 100 ||
			!kinds.has(e.type) ||
			!Number.isFinite(e.version)
		)
			throw Error("Invalid element");
		if (
			meta?.reference &&
			(!["image", "meme", "sound", "link", "note", "chart"].includes(meta.reference.kind) ||
				typeof meta.reference.id !== "string" ||
				meta.reference.id.length < 1 ||
				meta.reference.id.length > 100)
		)
			throw Error("Invalid shadow object reference");

		for (const k of ["x", "y", "width", "height", "angle"])
			if (
				typeof e[k] !== "number" ||
				!Number.isFinite(e[k]) ||
				Math.abs(e[k] as number) > 1e7
			)
				throw Error("Invalid geometry");
		const chart = (e.customData as { chart?: { chartId?: unknown } } | undefined)?.chart;
		if (
			chart !== undefined &&
			(e.type !== "rectangle" ||
				typeof chart?.chartId !== "string" ||
				!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chart.chartId))
		)
			throw Error("Invalid chart object");
		if (e.link || e.type === "embeddable" || e.type === "magicframe")
			throw Error("Embedded links are not supported on the recording board");
	}
	for (const [id, f] of Object.entries(s.files))
		if (
			!f ||
			f.id !== id ||
			typeof f.dataURL !== "string" ||
			f.dataURL.length > 16 * 1024 * 1024 ||
			!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(f.dataURL)
		)
			throw Error("Use PNG, JPEG or WebP images (up to 12 MB)");
	if (Object.keys(s.files).length > 200 || JSON.stringify(s).length > 48 * 1024 * 1024)
		throw Error("Board is too large");
	if (
		![s.scrollX, s.scrollY, s.zoom].every(Number.isFinite) ||
		s.zoom < 0.1 ||
		s.zoom > 10 ||
		Math.abs(s.scrollX) > 1e7 ||
		Math.abs(s.scrollY) > 1e7
	)
		throw Error("Invalid viewport");
	const result = structuredClone(s);
	result.elements = result.elements.map((e) =>
		normalizeChartCarrier(isShadow(e) ? { ...e, opacity: 50 } : e),
	);
	return result;
}
export function validateWhiteboards(s: BoardState) {
	if (
		s.whiteboards !== undefined &&
		(!Array.isArray(s.whiteboards) || s.whiteboards.length === 0)
	)
		throw Error("Invalid whiteboard tabs");
	const pages = whiteboardPages(s);
	if (pages.length > 20 || new Set(pages.map((p) => p.id)).size !== pages.length)
		throw Error("Invalid whiteboard tabs");
	for (const page of pages) {
		if (
			!/^[a-zA-Z0-9_-]{1,100}$/.test(page.id) ||
			typeof page.name !== "string" ||
			!page.name.trim() ||
			page.name.length > 80
		)
			throw Error("Invalid whiteboard name");
		page.scene = validateScene(page.scene);
		page.memes = validateMemes({
			...s,
			placedMemes: { screen: [], board: page.memes },
		}).placedMemes.board;
	}
	const activeWhiteboardId = s.activeWhiteboardId ?? pages[0].id;
	if (!pages.some((p) => p.id === activeWhiteboardId)) throw Error("Missing active whiteboard");
	return { whiteboards: pages, activeWhiteboardId };
}
export class BoardStore {
	state = emptyBoardState();
	private writes = Promise.resolve();
	constructor(readonly root: string) {
		if (process.platform === "linux") this.state.enabled = false;
	}
	async load() {
		try {
			const s = JSON.parse(
				await fs.readFile(path.join(this.root, "board.json"), "utf8"),
			) as BoardState;
			if (s.version !== 1) throw Error("Unsupported board version");
			this.state = {
				...emptyBoardState(),
				...s,
				...validateMemes(s),
				...validateWhiteboards(s),
				assets: validateScene({
					...emptyBoardScene(),
					files: {
						...s.scenes.screen.files,
						...s.scenes.board.files,
						...Object.assign({}, ...(s.whiteboards ?? []).map((p) => p.scene.files)),
						...(s.assets ?? {}),
					},
				}).files,
				enabled:
					process.platform !== "linux" &&
					(s.drawingDefaultsVersion === 1 ? s.enabled : true),
				drawingDefaultsVersion: 1,
				mode: "screen",
				output: s.drawingDefaultsVersion === 1 ? s.output : "screen-board",
				scenes: {
					screen: validateScene(s.scenes.screen),
					board: validateScene(s.scenes.board),
				},
			};
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
		}
	}
	async save() {
		this.state.whiteboards = whiteboardPages(this.state);
		this.state.activeWhiteboardId ??= this.state.whiteboards[0].id;
		const data = JSON.stringify(this.state);
		this.writes = this.writes
			.catch(() => undefined)
			.then(async () => {
				await fs.mkdir(this.root, { recursive: true });
				const tmp = path.join(this.root, `${randomUUID()}.tmp`);
				await fs.writeFile(tmp, data, { mode: 0o600 });
				await fs.rename(tmp, path.join(this.root, "board.json"));
			});
		await this.writes;
	}
	updateScene(
		mode: "screen" | "board",
		scene: unknown,
		baseRevision: number,
		patchFiles = false,
	) {
		if (baseRevision !== this.state.revision)
			throw Error("The board changed. Refresh and retry your edit.");
		const next = validateScene(scene);
		const hasFiles = Object.keys(next.files).length > 0;
		const assets = hasFiles ? this.mergeAssets(next.files) : this.state.assets;
		if (patchFiles) {
			const files = { ...this.state.scenes[mode].files, ...next.files };
			// Stroke-only patches reuse immutable image data. Validate the complete file
			// budget only when images change, rather than cloning it for every point.
			if (hasFiles) validateScene({ ...next, files });
			next.files = files;
		}
		this.state.scenes[mode] = next;
		this.state.assets = assets;
		this.state.revision++;
		return this.state;
	}
	mergeAssets(files: BoardScene["files"]) {
		return validateScene({ ...emptyBoardScene(), files: { ...this.state.assets, ...files } })
			.files;
	}
	async saveScene(name: string) {
		if (!/^[\p{L}\p{N} _-]{1,80}$/u.test(name))
			throw Error("Use a scene name with letters, numbers, spaces or dashes");
		await fs.mkdir(path.join(this.root, "scenes"), { recursive: true });
		const temporary = path.join(this.root, "scenes", `${randomUUID()}.tmp`);
		await fs.writeFile(temporary, JSON.stringify(this.state.scenes[this.state.mode]), {
			mode: 0o600,
		});
		await fs.rename(temporary, path.join(this.root, "scenes", `${name}.json`));
	}
	async listScenes() {
		return (await fs.readdir(path.join(this.root, "scenes")).catch(() => []))
			.filter((n) => n.endsWith(".json"))
			.map((n) => n.slice(0, -5));
	}
	async loadScene(name: string) {
		if (!(await this.listScenes()).includes(name)) throw Error("Unknown scene");
		this.updateScene(
			this.state.mode,
			JSON.parse(await fs.readFile(path.join(this.root, "scenes", `${name}.json`), "utf8")),
			this.state.revision,
		);
	}
}
export function makeElement(input: Record<string, unknown>): BoardElement {
	const type = String(input.type);
	if (!["rectangle", "ellipse", "diamond", "arrow", "line", "text", "freedraw"].includes(type))
		throw Error("Unsupported drawing tool");
	const e: BoardElement = {
		id: typeof input.id === "string" ? input.id : randomUUID(),
		type,
		x: 0,
		y: 0,
		width: 200,
		height: 100,
		angle: 0,
		strokeColor: "#1e1e1e",
		backgroundColor: "transparent",
		fillStyle: "solid",
		strokeWidth: 2,
		strokeStyle: "solid",
		roughness: 1,
		opacity: 100,
		groupIds: [],
		frameId: null,
		index: null,
		roundness: null,
		seed: Math.floor(Math.random() * 2e9),
		version: 1,
		versionNonce: Math.floor(Math.random() * 2e9),
		isDeleted: false,
		boundElements: null,
		updated: Date.now(),
		link: null,
		locked: false,
	};
	for (const k of [
		"x",
		"y",
		"width",
		"height",
		"angle",
		"strokeColor",
		"backgroundColor",
		"strokeWidth",
		"roughness",
		"opacity",
		"groupIds",
	])
		if (input[k] !== undefined) e[k] = input[k];
	if (type === "text") {
		const text = String(input.text ?? "");
		if (text.length > 10000) throw Error("Text too long");
		Object.assign(e, {
			text,
			originalText: text,
			fontSize: input.fontSize ?? 24,
			fontFamily: 1,
			textAlign: "left",
			verticalAlign: "top",
			containerId: null,
			autoResize: true,
			lineHeight: 1.25,
			height: Number(input.fontSize ?? 24) * 1.25 * text.split("\n").length,
		});
	}
	if (["line", "arrow", "freedraw"].includes(type))
		Object.assign(e, {
			points: input.points ?? [
				[0, 0],
				[e.width, 0],
			],
			lastCommittedPoint: null,
			startBinding: null,
			endBinding: null,
			startArrowhead: null,
			endArrowhead: type === "arrow" ? "arrow" : null,
			elbowed: false,
			pressures: [],
			simulatePressure: true,
		});
	return input.shadow !== undefined || input.note === true
		? setShadow(
				e,
				input.shadow !== false,
				input.enter as "none" | "fade" | "spin" | "fall" | undefined,
			)
		: e;
}
