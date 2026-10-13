import { beforeEach, expect, test, vi } from "vitest";
import { defaultVoiceSettings } from "../../../src/types/voice";
const mocks = vi.hoisted(() => ({
	handlers: new Map<string, (event: unknown, input?: unknown) => Promise<unknown>>(),
	send: vi.fn(),
	start: vi.fn().mockResolvedValue("job"),
	key: vi.fn().mockResolvedValue("mock-key"),
	read: vi.fn(),
	select: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("electron", () => ({
	app: { getAppPath: () => "/app", getPath: () => "/app/user-data" },
	safeStorage: {},
	BrowserWindow: {
		fromWebContents: () => ({}),
		getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: mocks.send } }],
	},
	ipcMain: {
		handle: (name: string, handler: (event: unknown, input: unknown) => Promise<unknown>) =>
			mocks.handlers.set(name, handler),
	},
}));
vi.mock("./presetHandlers", () => ({
	registerPresetHandlers: vi.fn(),
	synchronizeFavoriteVoice: mocks.select,
}));
vi.mock("./settings", () => ({
	VoiceSettingsStore: class {
		read = mocks.read;
		key = mocks.key;
		publicSettings = mocks.read;
	},
}));
vi.mock("./job", () => ({ startVoiceJob: mocks.start, cancelJob: vi.fn(), jobProgress: () => [] }));
vi.mock("./chunker", () => ({ ffmpeg: vi.fn() }));
vi.mock("../recording/library", () => ({
	prepareRecordingAudio: vi.fn(),
	recordingBase: vi.fn(),
	readAudioMetadata: vi.fn(),
	writeAudioMetadata: vi.fn(),
}));
vi.mock("../project/manager", () => ({ resolveApprovedLocalMediaPath: async (p: string) => p }));
vi.mock("../utils", () => ({ getRecordingsDir: vi.fn() }));
vi.mock("../../rendererServer", () => ({
	getPackagedRendererBaseUrl: () => "http://127.0.0.1:9999/",
}));
import { registerVoiceHandlers } from "./register";
const frame = { url: "http://127.0.0.1:9999/" };
const event = { senderFrame: frame, sender: { mainFrame: frame } };
beforeEach(() => {
	vi.clearAllMocks();
	mocks.read.mockResolvedValue({ ...defaultVoiceSettings, voiceId: "favorite", enabled: true });
	registerVoiceHandlers();
});
test("recording completion never reads credentials or starts processing, even with legacy auto-run enabled", async () => {
	expect(await mocks.handlers.get("voice:afterRecording")!(event, "/recording.mp4")).toEqual({
		ok: true,
		data: null,
	});
	expect(mocks.start).not.toHaveBeenCalled();
	expect(mocks.key).not.toHaveBeenCalled();
	expect(mocks.send).toHaveBeenCalledWith("voice:audioChanged", "/recording.mp4");
});
test("explicit Process voice uses the selected voice and waits for startup selection", async () => {
	let release!: () => void;
	mocks.select.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			}),
	);
	registerVoiceHandlers();
	const processing = mocks.handlers.get("voice:start")!(event, "/recording.mp4");
	await Promise.resolve();
	expect(mocks.start).not.toHaveBeenCalled();
	release();
	expect(await processing).toEqual({ ok: true, data: "job" });
	expect(mocks.start).toHaveBeenCalledWith(
		"/recording.mp4",
		expect.objectContaining({ voiceId: "favorite" }),
		expect.anything(),
	);
});
