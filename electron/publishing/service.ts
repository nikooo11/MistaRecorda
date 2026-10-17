import { app, dialog, safeStorage, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
	defaultUploadMetadata,
	uploadMetadataSchema,
	YOUTUBE_WAITING,
	type PublishingInfo,
	type UploadProgress,
} from "../../src/types/publishing";
import {
	rememberApprovedLocalReadPath,
	resolveApprovedLocalMediaPath,
	isAllowedLocalReadPath,
} from "../ipc/project/manager";
import { serializeSrt } from "../ipc/register/exportCaptionSidecars";
import { YouTubeAuth, youtubeConfig } from "./auth";
import { YouTubeProvider } from "./youtube";
import type { UploadJob } from "./provider";
const cueSchema = z
	.object({
		startMs: z.number().finite().min(0),
		endMs: z.number().finite().min(0),
		text: z.string().max(10000),
	})
	.refine((c) => c.endMs > c.startMs);
const cuesSchema = z.array(cueSchema).max(20000);
const idle = (): UploadProgress => ({
	phase: "idle",
	uploaded: 0,
	total: 0,
	error: "",
	warnings: [],
	canRetry: false,
});
export class PublishingService {
	private auth: YouTubeAuth;
	private provider: YouTubeProvider;
	private progress = idle();
	private controller?: AbortController;
	private job?: UploadJob;
	private config = youtubeConfig();
	private dir = path.join(app.getPath("userData"), "publishing");
	constructor() {
		this.auth = new YouTubeAuth(this.dir, safeStorage, this.config, (u) =>
			shell.openExternal(u),
		);
		this.provider = new YouTubeProvider(this.auth, this.config.approved);
	}
	async info(): Promise<PublishingInfo> {
		return {
			available: !!this.config.clientId,
			approved: this.config.approved,
			connected: await this.auth.connected(),
			captionPermission: await this.auth.captionPermission(),
			status: this.config.approved ? "YouTube upload" : YOUTUBE_WAITING,
			progress: { ...this.progress },
		};
	}
	private free() {
		if (this.controller) throw Error("Finish or cancel the current YouTube action first.");
	}
	private async run(
		task: (signal: AbortSignal) => Promise<void>,
		phase: "connecting" | "uploading",
	) {
		this.free();
		const controller = new AbortController();
		this.controller = controller;
		this.progress = { ...idle(), phase };
		void task(controller.signal)
			.catch((e) => {
				this.progress = {
					...this.progress,
					phase: controller.signal.aborted ? "cancelled" : "error",
					error: controller.signal.aborted
						? "Cancelled. Your local export is safe."
						: e instanceof Error
							? e.message
							: "YouTube action failed.",
					canRetry: phase === "uploading" && !!this.job,
				};
			})
			.finally(() => {
				if (this.controller === controller) this.controller = undefined;
			});
		return this.info();
	}
	private async upload(signal: AbortSignal) {
		const job = this.job!;
		const id = await this.provider.upload(
			job,
			(uploaded, total) => {
				this.progress = { ...this.progress, uploaded, total };
			},
			signal,
		);
		this.progress = { ...this.progress, videoUrl: `https://www.youtube.com/watch?v=${id}` };
		// A completed video is never re-uploaded if an optional attachment fails.
		const warnings: string[] = [];
		if (job.thumbnail) {
			try {
				await this.provider.thumbnail(id, job.thumbnail, signal);
				job.thumbnail = undefined;
			} catch {
				warnings.push(
					"Video uploaded; thumbnail was not added. Retry or add it in YouTube Studio.",
				);
			}
		}
		if (job.srt) {
			try {
				if (!(await this.auth.captionPermission(true))) throw Error("permission");
				await this.provider.captions(id, job.srt, job.metadata, signal);
				job.srt = undefined;
			} catch {
				warnings.push(
					"Video uploaded; captions were not added. Save the SRT file and add it in YouTube Studio, or reconnect with captions permission.",
				);
			}
		}
		this.progress = {
			...this.progress,
			phase: "done",
			warnings,
			canRetry: !!(job.thumbnail || job.srt),
		};
	}
	private presetPath(key: string) {
		return path.join(
			this.dir,
			"presets",
			createHash("sha256").update(key).digest("hex") + ".json",
		);
	}
	async request(method: string, input: unknown) {
		if (method === "info") return this.info();
		if (method === "cancel") {
			this.controller?.abort();
			return this.info();
		}
		if (method === "connect") {
			const captions = z
				.object({ captions: z.boolean().default(false) })
				.parse(input ?? {}).captions;
			return this.run(async (signal) => {
				await this.auth.connect(captions, signal);
				this.progress = idle();
			}, "connecting");
		}
		if (method === "disconnect") {
			this.free();
			await this.auth.disconnect();
			this.progress = idle();
			return this.info();
		}
		if (method === "thumbnail") {
			const result = await dialog.showOpenDialog({
				title: "Choose YouTube thumbnail",
				properties: ["openFile"],
				filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }],
			});
			const file = result.canceled ? null : result.filePaths[0];
			if (file) await rememberApprovedLocalReadPath(file);
			return file;
		}
		if (method === "preset") {
			const { key, metadata } = z
				.object({
					key: z.string().min(1).max(4096),
					metadata: uploadMetadataSchema.optional(),
				})
				.parse(input);
			const file = this.presetPath(key);
			if (metadata) {
				await fs.mkdir(path.dirname(file), { recursive: true });
				await fs.writeFile(file, JSON.stringify(metadata), { mode: 0o600 });
				return metadata;
			}
			return fs
				.readFile(file, "utf8")
				.then((t) => uploadMetadataSchema.parse(JSON.parse(t)))
				.catch(() => defaultUploadMetadata);
		}
		if (method === "markers") {
			const file = await resolveApprovedLocalMediaPath(z.string().max(4096).parse(input));
			if (!file) return [];
			const sidecar = file + ".presentation-markers.json";
			if (!isAllowedLocalReadPath(sidecar)) return [];
			const stat = await fs.stat(sidecar).catch(() => null);
			if (!stat || stat.size > 1024 * 1024) return [];
			return fs
				.readFile(sidecar, "utf8")
				.then((t) =>
					z
						.array(
							z.object({
								timeMs: z.number().finite().min(0),
								label: z.string().max(200),
								kind: z.enum(["scene", "zoom", "point"]),
							}),
						)
						.max(5000)
						.parse(JSON.parse(t)),
				)
				.catch(() => []);
		}
		if (method === "saveCaptions") {
			const cues = cuesSchema.parse(input);
			const result = await dialog.showSaveDialog({
				title: "Save captions for YouTube Studio",
				defaultPath: "captions.srt",
				filters: [{ name: "SubRip captions", extensions: ["srt"] }],
			});
			if (result.canceled || !result.filePath) return false;
			await fs.writeFile(result.filePath, serializeSrt(cues));
			return true;
		}
		if (method === "retry") {
			this.free();
			if (!this.job) throw Error("Choose a finished export first.");
			return this.run((signal) => this.upload(signal), "uploading");
		}
		if (method === "start") {
			this.free();
			if (!this.config.clientId) throw Error(YOUTUBE_WAITING);
			const data = z
				.object({
					file: z.string().max(4096),
					metadata: uploadMetadataSchema,
					thumbnail: z.string().max(4096).optional(),
					cues: cuesSchema.optional(),
				})
				.parse(input);
			const file = await resolveApprovedLocalMediaPath(data.file);
			if (!file || path.extname(file).toLowerCase() !== ".mp4")
				throw Error("Choose a finished MP4 export.");
			let thumbnail: string | undefined;
			if (data.thumbnail) {
				thumbnail = (await resolveApprovedLocalMediaPath(data.thumbnail)) ?? undefined;
				if (!thumbnail || !/^\.(png|jpe?g)$/i.test(path.extname(thumbnail)))
					throw Error("Choose a PNG or JPEG thumbnail.");
			}
			const srt = data.cues?.length ? serializeSrt(data.cues) : undefined;
			if (srt && !(await this.auth.captionPermission(true)))
				throw Error(
					"Turn off separate caption upload, or reconnect with captions permission. Captions already visible in the video can stay.",
				);
			if (srt && Buffer.byteLength(srt) > 5 * 1024 * 1024)
				throw Error("Captions exceed 5 MB.");
			this.free();
			this.job = { file, metadata: data.metadata, thumbnail, srt };
			return this.run((signal) => this.upload(signal), "uploading");
		}
		throw Error("Unknown publishing action.");
	}
}
let publisher: PublishingService | undefined;
export function publishingRequest(method: string, input: unknown) {
	publisher ??= new PublishingService();
	return publisher.request(method, input);
}
