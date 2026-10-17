import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const host = vi.hoisted(() => ({
	root: "",
	active: false,
	send: vi.fn(),
	contents: undefined as unknown,
	loads: 0,
}));
vi.mock("electron", () => ({
	app: { getPath: () => host.root, getAppPath: () => process.cwd() },
	BrowserWindow: class extends EventEmitter {
		webContents = Object.assign(new EventEmitter(), { send: host.send });
		constructor() {
			super();
			host.contents = this.webContents;
		}
		getTitle() {
			return "Audio engine";
		}
		setContentProtection() {}
		loadURL() {
			host.loads++;
			return Promise.resolve();
		}
		destroy() {
			this.emit("closed");
		}
	},
}));
vi.mock("../ipc/state", () => ({
	get isCursorCaptureActive() {
		return host.active;
	},
}));
vi.mock("../rendererServer", () => ({
	getPackagedRendererBaseUrl: () => "http://127.0.0.1:9876/",
}));

import {
	audioEngineReply,
	isStreaming,
	startStream,
	stopStream,
	streamDevices,
	streamInfo,
} from "./streamAudio";

afterEach(async () => {
	host.active = false;
	if (host.root) await fs.rm(host.root, { recursive: true, force: true });
});
test("stream routing stays off until explicitly started and rejects unsafe defaults and recording conflicts", async () => {
	host.root = await fs.mkdtemp(path.join(os.tmpdir(), "stream-test-"));
	expect(await streamInfo()).toMatchObject({ active: false });
	expect(host.loads).toBe(0);
	const routing = {
		input: "mic",
		output: "virtual",
		monitor: "phones",
		inputLabel: "Microphone",
		outputLabel: "Virtual",
		virtualOutputConfirmed: true,
	};
	await expect(startStream({ ...routing, output: "default" })).rejects.toThrow(
		"dedicated virtual",
	);
	await expect(startStream({ ...routing, monitor: "virtual" })).rejects.toThrow(
		"dedicated virtual",
	);
	await expect(startStream({ ...routing, virtualOutputConfirmed: false })).rejects.toThrow();
	host.active = true;
	await expect(startStream(routing)).rejects.toThrow("Stop recording");
	host.active = false;
	host.send.mockImplementation((_channel, command) =>
		queueMicrotask(() =>
			audioEngineReply(host.contents as Electron.WebContents, "audioEngineReply", {
				id: command.id,
				result: command.method === "devices" ? [] : true,
			}),
		),
	);
	const devices = streamDevices();
	await vi.waitFor(() => expect(host.loads).toBe(1));
	expect(() =>
		audioEngineReply({} as Electron.WebContents, "audioEngineReady", undefined),
	).toThrow("Only the audio engine");
	audioEngineReply(host.contents as Electron.WebContents, "audioEngineReady", undefined);
	await devices;
	expect((await startStream(routing)).active).toBe(true);
	expect(isStreaming()).toBe(true);
	expect(
		JSON.parse(await fs.readFile(path.join(host.root, "studio/stream-routing.json"), "utf8")),
	).toEqual(routing);
	await stopStream();
	expect(isStreaming()).toBe(false);
	// A settings write failure must not leave an unreported microphone stream running.
	const config = path.join(host.root, "studio/stream-routing.json");
	await fs.rm(config);
	await fs.mkdir(config);
	await expect(startStream(routing)).rejects.toThrow();
	expect(isStreaming()).toBe(false);
});
