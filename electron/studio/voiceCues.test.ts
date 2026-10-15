import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const host = vi.hoisted(() => ({
	root: "",
	recording: false,
	keyAccess: vi.fn(),
	voices: vi.fn(),
}));
vi.mock("electron", () => ({ app: { getPath: () => host.root } }));
vi.mock("../ipc/state", () => ({
	get isCursorCaptureActive() {
		return host.recording;
	},
}));
vi.mock("../ipc/cursor/telemetry", () => ({
	getCursorCaptureElapsedMs: () => 1000,
	isCursorCapturePaused: () => false,
}));
vi.mock("../ipc/recording/library", () => ({
	prepareRecordingAudio: vi.fn(),
	writeAudioMetadata: vi.fn(),
}));
vi.mock("../ipc/voice/presets", () => ({
	PresetStore: class {
		favorites() {
			return Promise.resolve(["voice-a"]);
		}
	},
}));
vi.mock("../ipc/voice/register", () => ({
	voiceStore: () => ({ hasKey: () => Promise.resolve(true) }),
	voiceClient: async () => {
		host.keyAccess();
		return { voices: host.voices };
	},
}));

import { recordingVoiceList } from "./voiceCues";

afterEach(async () => {
	if (host.root) await fs.rm(host.root, { force: true, recursive: true });
});
test("opening or refreshing voices during a take uses the saved catalog without Keychain or network access", async () => {
	host.root = await fs.mkdtemp(path.join(os.tmpdir(), "voice-catalog-"));
	await fs.mkdir(path.join(host.root, "studio"));
	await fs.writeFile(
		path.join(host.root, "studio/voice-catalog.json"),
		JSON.stringify([{ voiceId: "voice-a", name: "Saved voice" }]),
	);
	host.recording = true;
	expect((await recordingVoiceList(true)).voices).toMatchObject([
		{ id: "voice-a", name: "Saved voice", favorite: true },
	]);
	expect(host.keyAccess).not.toHaveBeenCalled();
	host.recording = false;
	await recordingVoiceList();
	expect(host.keyAccess).not.toHaveBeenCalled();
	host.voices.mockResolvedValue([
		{ voiceId: "voice-a", name: "Updated voice", extra: "discard" },
	]);
	await recordingVoiceList(true);
	expect(host.keyAccess).toHaveBeenCalledOnce();
	expect(
		JSON.parse(await fs.readFile(path.join(host.root, "studio/voice-catalog.json"), "utf8")),
	).toEqual([{ voiceId: "voice-a", name: "Updated voice" }]);
});
