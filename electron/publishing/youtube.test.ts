import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { YouTubeProvider, videoMetadata, uploadURL, resumeOffset } from "./youtube";
import { defaultUploadMetadata, chapterText } from "../../src/types/publishing";
import { PresentationMarkers } from "./markers";
const dirs: string[] = [];
async function file() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "youtube-test-"));
	dirs.push(dir);
	const file = path.join(dir, "video.mp4");
	await fs.writeFile(file, Buffer.alloc(100));
	return file;
}
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});
const session = "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test";
const init = () => new Response(null, { status: 200, headers: { location: session } });
const done = () => Response.json({ id: "video_test_123" });
describe("YouTube provider", () => {
	it("enforces private before approval and validates resumable host and offset", () => {
		expect(
			videoMetadata({ ...defaultUploadMetadata, privacy: "public" }, false).status
				.privacyStatus,
		).toBe("private");
		expect(
			videoMetadata({ ...defaultUploadMetadata, privacy: "unlisted" }, true).status
				.privacyStatus,
		).toBe("unlisted");
		expect(() => uploadURL("https://evil.test/upload/youtube/v3/videos")).toThrow();
		expect(() => uploadURL("https://www.googleapis.com/other")).toThrow();
		expect(resumeOffset("bytes=0-49", 100)).toBe(50);
		expect(() => resumeOffset("bytes=0-100", 100)).toThrow();
	});
	it("resumes from acknowledged bytes after a network interruption without starting a second video", async () => {
		const calls: RequestInit[] = [];
		let i = 0;
		const request = vi.fn(async (_url: unknown, options?: RequestInit) => {
			calls.push(options!);
			i++;
			if (i === 1) return init();
			if (i === 2) throw new TypeError("offline");
			if (i === 3)
				return new Response(null, { status: 308, headers: { range: "bytes=0-49" } });
			return done();
		}) as unknown as typeof fetch;
		const wait = vi.fn(async () => {});
		const provider = new YouTubeProvider(
			{ accessToken: async () => "test-token" },
			false,
			request,
			wait,
		);
		const job = { file: await file(), metadata: defaultUploadMetadata };
		const progress = vi.fn();
		expect(await provider.upload(job, progress, new AbortController().signal)).toBe(
			"video_test_123",
		);
		expect(calls.map((c) => new Headers(c.headers).get("Content-Range"))).toEqual([
			null,
			"bytes 0-99/100",
			"bytes */100",
			"bytes 50-99/100",
		]);
		expect(JSON.parse(calls[0].body as string).status.privacyStatus).toBe("private");
		expect(wait).toHaveBeenCalledTimes(1);
		expect(progress).toHaveBeenLastCalledWith(100, 100);
	});
	it("reports quota without retrying, and refuses changed files when resuming", async () => {
		const f = await file();
		const request = vi.fn(async () =>
			Response.json({ error: { errors: [{ reason: "quotaExceeded" }] } }, { status: 403 }),
		) as unknown as typeof fetch;
		const provider = new YouTubeProvider({ accessToken: async () => "x" }, false, request);
		await expect(
			provider.upload(
				{ file: f, metadata: defaultUploadMetadata },
				() => {},
				new AbortController().signal,
			),
		).rejects.toThrow("quota");
		expect(request).toHaveBeenCalledTimes(1);
		await expect(
			provider.upload(
				{ file: f, metadata: defaultUploadMetadata, session, size: 2, mtimeMs: 1 },
				() => {},
				new AbortController().signal,
			),
		).rejects.toThrow("changed");
	});
	it("stops retrying failed chunks even when status probes succeed without progress", async () => {
		let chunks = 0;
		const request = vi.fn(async (_url: unknown, options?: RequestInit) => {
			if (options?.method === "POST") return init();
			if (new Headers(options?.headers).get("Content-Range") === "bytes */100")
				return new Response(null, { status: 308 });
			if (++chunks > 10) throw Error("Retry loop escaped its budget");
			throw new TypeError("offline");
		}) as unknown as typeof fetch;
		const wait = vi.fn(async () => {});
		const provider = new YouTubeProvider(
			{ accessToken: async () => "x" },
			false,
			request,
			wait,
		);
		await expect(
			provider.upload(
				{ file: await file(), metadata: defaultUploadMetadata },
				() => {},
				new AbortController().signal,
			),
		).rejects.toThrow("offline");
		expect(chunks).toBe(5);
		expect(wait).toHaveBeenCalledTimes(4);
	});
	it("bounded probes handle a fully acknowledged upload awaiting completion", async () => {
		let i = 0;
		const request = vi.fn(async () =>
			++i === 1
				? init()
				: new Response(null, { status: 308, headers: { range: "bytes=0-99" } }),
		) as unknown as typeof fetch;
		const provider = new YouTubeProvider(
			{ accessToken: async () => "x" },
			false,
			request,
			async () => {},
		);
		await expect(
			provider.upload(
				{ file: await file(), metadata: defaultUploadMetadata },
				() => {},
				new AbortController().signal,
			),
		).rejects.toThrow("not confirmed");
		expect(request).toHaveBeenCalledTimes(6);
	});
	it("cancellation does not send bytes and completed jobs do not upload twice", async () => {
		const request = vi.fn() as unknown as typeof fetch;
		const provider = new YouTubeProvider({ accessToken: async () => "x" }, false, request);
		const controller = new AbortController();
		controller.abort();
		await expect(
			provider.upload(
				{ file: await file(), metadata: defaultUploadMetadata },
				() => {},
				controller.signal,
			),
		).rejects.toThrow();
		expect(
			await provider.upload(
				{ file: "unused", metadata: defaultUploadMetadata, videoId: "video_test" },
				() => {},
				new AbortController().signal,
			),
		).toBe("video_test");
		expect(request).not.toHaveBeenCalled();
	});
});
it("generates editable chapter drafts from ordered markers, discarding close or outside events", () => {
	expect(
		chapterText(
			[
				{ timeMs: 20000, label: "Second", kind: "point" },
				{ timeMs: 4000, label: "Too soon", kind: "zoom" },
				{ timeMs: 10000, label: "First\npoint", kind: "scene" },
				{ timeMs: 60000, label: "Outside", kind: "scene" },
			],
			60000,
		),
	).toBe("00:00 Introduction\n00:10 First point\n00:20 Second");
});
it("starts a fresh marker list per take and saves source-clock timestamps", async () => {
	const m = new PresentationMarkers();
	m.start("First");
	m.add("point", "Covered", 12340);
	expect(m.snapshot()).toHaveLength(2);
	const f = await file();
	await m.save(f);
	expect(JSON.parse(await fs.readFile(f + ".presentation-markers.json", "utf8"))[1].timeMs).toBe(
		12340,
	);
	m.start("Second");
	expect(m.snapshot()).toEqual([{ kind: "scene", label: "Second", timeMs: 0 }]);
});
