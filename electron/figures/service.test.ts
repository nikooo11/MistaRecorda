import { test, expect, vi, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	cancel: vi.fn(async () => undefined),
	remove: vi.fn(async () => undefined),
	transcribe: vi.fn(),
	generate: vi.fn(),
}));
vi.mock("openai", () => {
	class APIError extends Error {}
	return {
		default: class {
			static APIError = APIError;
			beta = {
				agents: {
					sessions: {
						create: mocks.create,
						events: { create: mocks.cancel },
						delete: mocks.remove,
					},
				},
			};
			audio = { transcriptions: { create: mocks.transcribe } };
			images = { generate: mocks.generate };
		},
		toFile: vi.fn(async () => ({})),
	};
});
import { FigureService } from "./service";
import { FigureSettings } from "./settings";
const dirs: string[] = [];
afterEach(async () => {
	vi.clearAllMocks();
	for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});
async function service() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "figure-service-"));
	dirs.push(root);
	const settings = new FigureSettings(root, {
		isEncryptionAvailable: () => true,
		encryptString: Buffer.from,
		decryptString: (b) => b.toString(),
	});
	await settings.setKey("sk-test-only");
	return new FigureService(settings, () => {});
}
function stream(text: string) {
	return {
		withResultCollection: () => {},
		controller: { abort: vi.fn() },
		async *[Symbol.asyncIterator]() {
			yield { type: "agent.session.created", session: { id: "test-session" } };
		},
		finalResult: async () => ({ output_text: text, session_id: "test-session" }),
	};
}
async function finished(s: FigureService) {
	await vi.waitFor(() => expect(["ready", "error"]).toContain(s.state.phase));
}
test("search delegates research, bounds spend, returns sources and cleans hosted resources", async () => {
	const s = await service();
	mocks.create.mockResolvedValue(
		stream(
			JSON.stringify({
				results: [
					{
						title: "Jobs",
						kind: "chart",
						summary: "A monthly report",
						url: "https://www.bls.gov",
						source: "BLS",
						imageUrl: null,
						usage: "Check source terms",
						prompt: "",
					},
				],
			}),
		),
	);
	await s.search("Employment since 2020");
	await finished(s);
	expect(s.state.results).toHaveLength(1);
	expect(mocks.create.mock.calls[0][0]).toMatchObject({
		agent: { multi_agent: { enabled: true, max_concurrent_subagents: 2 } },
		spend_control: { limit: 100 },
		environment: { type: "openai_hosted" },
	});
	expect(mocks.remove).toHaveBeenCalledWith("test-session", { timeout: 10000 });
	expect(s.state.preview).toBeUndefined();
});
test("failed output still deletes the hosted session and never creates board content", async () => {
	const s = await service();
	mocks.create.mockResolvedValue(stream("not json"));
	await s.search("Test");
	await finished(s);
	expect(s.state.phase).toBe("error");
	expect(mocks.remove).toHaveBeenCalledWith("test-session", { timeout: 10000 });
	expect(s.state.results).toEqual([]);
});
test("cancelled transcription cannot replace the topic with late audio", async () => {
	const s = await service();
	let finish!: (v: { text: string }) => void;
	mocks.transcribe.mockImplementation(
		() =>
			new Promise((r) => {
				finish = r;
			}),
	);
	await s.listen();
	await s.transcribe({ data: "YQ==", mime: "audio/webm" });
	await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
	await s.cancel();
	finish({ text: "Late transcript" });
	await new Promise((r) => setTimeout(r, 10));
	expect(s.state.phase).toBe("idle");
	expect(s.state.topic).toBe("");
});

test("AI mic transcript can find library memes using tags without uploading GIFs or triggering sounds", async () => {
	const base = await service();
	const meme = {
		id: "8c4c2b71-3d8a-41f5-9a42-000000000001",
		name: "Seriously",
		tags: ["stupid", "really", "disbelief"],
		description: "A disbelieving reaction",
		dataURL: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
		width: 10,
		height: 10,
		enter: "none" as const,
		exit: "none" as const,
		stayUntilClicked: true,
		durationSeconds: 5,
		soundId: "",
		loved: true,
	};
	const s = new FigureService(
		base.settings,
		() => {},
		() => [meme],
	);
	mocks.transcribe.mockResolvedValue({ text: "Seriously, that was a stupid idea" });
	await s.listen();
	await s.transcribe({ data: "YQ==", mime: "audio/webm" });
	await finished(s);
	mocks.create.mockResolvedValue(
		stream(
			JSON.stringify({
				results: [
					{
						kind: "meme",
						memeId: meme.id,
						summary: "A disbelieving reaction fits this comment",
					},
				],
			}),
		),
	);
	await s.search(s.state.topic);
	await finished(s);
	const input = JSON.parse(mocks.create.mock.calls[0][0].input);
	expect(input.topic).toContain("stupid idea");
	expect(input.memeLibrary[0]).toMatchObject({ id: meme.id, tags: meme.tags, loved: true });
	expect(JSON.stringify(input)).not.toContain("base64");
	expect(s.state.results[0]).toMatchObject({ kind: "meme", memeId: meme.id, title: "Seriously" });
	expect(mocks.generate).not.toHaveBeenCalled();
	expect(mocks.remove).toHaveBeenCalled();
});
