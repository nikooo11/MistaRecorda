import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { uploadMetadataSchema, type UploadMetadata } from "../../src/types/publishing";
import type { UploadJob, VideoUploadProvider } from "./provider";
import type { YouTubeAuth } from "./auth";
export function videoMetadata(value: unknown, approved: boolean) {
	const m = uploadMetadataSchema.parse(value);
	const description = [m.description, m.chapters].filter(Boolean).join("\n\n");
	if (description.length > 5000)
		throw Error("Description and chapters must total 5,000 characters or fewer.");
	return {
		snippet: {
			title: m.title,
			description,
			tags: m.tags,
			categoryId: m.categoryId,
			defaultLanguage: m.language,
		},
		status: {
			privacyStatus: approved ? m.privacy : "private",
			selfDeclaredMadeForKids: m.madeForKids,
		},
	};
}
export function uploadURL(value: string) {
	const u = new URL(value);
	if (
		u.protocol !== "https:" ||
		u.hostname !== "www.googleapis.com" ||
		u.port ||
		u.username ||
		u.password ||
		u.pathname !== "/upload/youtube/v3/videos"
	)
		throw Error("Google returned an unexpected upload address.");
	return u.href;
}
export function resumeOffset(range: string | null, total: number) {
	if (!range) return 0;
	const match = /^bytes=0-(\d+)$/.exec(range);
	const offset = match ? Number(match[1]) + 1 : NaN;
	if (!Number.isSafeInteger(offset) || offset < 1 || offset > total)
		throw Error("Google returned an invalid upload position.");
	return offset;
}
class UploadHTTPError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}
async function check(response: Response) {
	if (response.ok || response.status === 308) return;
	const reason = await response
		.json()
		.then((d) => d.error?.errors?.[0]?.reason ?? d.error?.status)
		.catch(() => "");
	const message = /quota|limit|resource_exhausted/i.test(String(reason))
		? "YouTube quota or upload limit reached. Your file is safe. Try later or check your Google Cloud quota."
		: response.status === 401
			? "Reconnect YouTube: authorization expired."
			: response.status === 403
				? "YouTube rejected this action. Check channel permissions, verification and test-user access."
				: response.status === 404
					? "The resumable upload expired. Start a new upload."
					: response.status >= 500
						? "YouTube is temporarily unavailable. Retry to resume."
						: "YouTube rejected the upload. Check title, metadata and channel setup.";
	throw new UploadHTTPError(message, response.status);
}
export class YouTubeProvider implements VideoUploadProvider {
	readonly id = "youtube";
	constructor(
		private auth: Pick<YouTubeAuth, "accessToken">,
		private approved: boolean,
		private request: typeof fetch = fetch,
		private wait: (ms: number, signal: AbortSignal) => Promise<unknown> = (ms, signal) =>
			delay(ms, undefined, { signal }),
	) {}
	private async call(url: string, init: RequestInit, signal: AbortSignal) {
		const perform = async (force = false) =>
			this.request(url, {
				...init,
				redirect: "manual",
				signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
				headers: {
					...init.headers,
					Authorization: `Bearer ${await this.auth.accessToken(force)}`,
				},
			});
		let response = await perform();
		if (response.status === 401) {
			signal.throwIfAborted();
			response = await perform(true);
		}
		return response;
	}
	async upload(
		job: UploadJob,
		progress: (uploaded: number, total: number) => void,
		signal: AbortSignal,
	) {
		signal.throwIfAborted();
		if (job.videoId) return job.videoId;
		const file = await fs.open(job.file, "r");
		try {
			const stat = await file.stat();
			if (!stat.isFile() || !stat.size) throw Error("Choose a finished video export.");
			if (job.session && (job.size !== stat.size || job.mtimeMs !== stat.mtimeMs))
				throw Error("This file changed after upload began. Start a new upload.");
			job.size = stat.size;
			job.mtimeMs = stat.mtimeMs;
			let offset = 0,
				highWater = 0,
				retries = 0,
				unconfirmed = 0,
				probe = !!job.session;
			progress(0, stat.size);
			if (!job.session) {
				const response = await this.call(
					"https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false",
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json; charset=UTF-8",
							"X-Upload-Content-Length": String(stat.size),
							"X-Upload-Content-Type": "video/mp4",
						},
						body: JSON.stringify(videoMetadata(job.metadata, this.approved)),
					},
					signal,
				);
				await check(response);
				job.session = uploadURL(response.headers.get("location") ?? "");
			}
			const url = uploadURL(job.session);
			while (true) {
				signal.throwIfAborted();
				try {
					let response: Response;
					if (probe) {
						response = await this.call(
							url,
							{
								method: "PUT",
								headers: {
									"Content-Length": "0",
									"Content-Range": `bytes */${stat.size}`,
								},
							},
							signal,
						);
					} else {
						const size = Math.min(8 * 1024 * 1024, stat.size - offset);
						if (size <= 0)
							throw Error(
								"Google has not confirmed this upload. Retry to check its status.",
							);
						const data = Buffer.alloc(size);
						const read = await file.read(data, 0, size, offset);
						if (read.bytesRead !== size)
							throw Error("Export file changed during upload.");
						response = await this.call(
							url,
							{
								method: "PUT",
								headers: {
									"Content-Type": "video/mp4",
									"Content-Length": String(size),
									"Content-Range": `bytes ${offset}-${offset + size - 1}/${stat.size}`,
								},
								body: data,
							},
							signal,
						);
					}
					await check(response);
					if (response.ok) {
						const result = await response.json();
						if (
							typeof result.id !== "string" ||
							!/^[A-Za-z0-9_-]{6,64}$/.test(result.id)
						)
							throw Error(
								"Google did not return a video ID. Retry to check this upload.",
							);
						job.videoId = result.id;
						progress(stat.size, stat.size);
						return result.id as string;
					}
					const confirmed = resumeOffset(response.headers.get("range"), stat.size);
					if (!probe && confirmed <= offset)
						throw new UploadHTTPError("Upload made no progress. Retry to resume.", 503);
					// A reachable status endpoint alone is not upload progress. Keep the retry
					// budget until Google acknowledges bytes beyond the previous high-water mark.
					if (confirmed > highWater) {
						highWater = confirmed;
						retries = 0;
					}
					offset = confirmed;
					probe = offset === stat.size;
					progress(offset, stat.size);
					if (probe) {
						if (++unconfirmed > 4)
							throw Error(
								"Google has the file but has not confirmed completion. Retry to check this upload.",
							);
						await this.wait(1000 * unconfirmed, signal);
					} else {
						unconfirmed = 0;
					}
				} catch (e) {
					signal.throwIfAborted();
					const retryable =
						e instanceof TypeError ||
						(e instanceof Error && e.name === "TimeoutError") ||
						(e instanceof UploadHTTPError && (e.status >= 500 || e.status === 429));
					if (!retryable || retries >= 4) throw e;
					await this.wait(Math.min(1000 * 2 ** retries, 8000), signal);
					retries++;
					probe = true;
				}
			}
		} finally {
			await file.close();
		}
	}
	async thumbnail(videoId: string, file: string, signal: AbortSignal) {
		const bytes = await fs.readFile(file);
		if (bytes.length > 10 * 1024 * 1024) throw Error("Thumbnail exceeds 10 MB.");
		const response = await this.call(
			`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
			{
				method: "POST",
				headers: {
					"Content-Type":
						path.extname(file).toLowerCase() === ".png" ? "image/png" : "image/jpeg",
				},
				body: bytes,
			},
			signal,
		);
		await check(response);
	}
	async captions(videoId: string, srt: string, metadata: UploadMetadata, signal: AbortSignal) {
		const boundary = `mistarecorda-${randomUUID()}`;
		const parts = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ snippet: { videoId, language: metadata.language, name: "Captions", isDraft: false } })}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${srt}\r\n--${boundary}--\r\n`;
		const response = await this.call(
			"https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet",
			{
				method: "POST",
				headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
				body: parts,
			},
			signal,
		);
		await check(response);
	}
}
