import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("recording microphone discovery", () => {
	beforeEach(() => vi.resetModules());
	afterEach(() => vi.useRealTimers());
	const mic = {
		kind: "audioinput",
		deviceId: "selected",
		groupId: "built-in",
		label: "Studio microphone",
	} as MediaDeviceInfo;
	it("starts from the cached selected microphone when the HUD is hidden", async () => {
		const { rememberRecordingAudioDevices, getRecordingAudioDevices } = await import(
			"./recordingAudioDevices"
		);
		rememberRecordingAudioDevices([mic]);
		const enumerateDevices = vi.fn(() => new Promise<MediaDeviceInfo[]>(() => {}));
		expect(await getRecordingAudioDevices({ enumerateDevices }, false)).toEqual([
			{ deviceId: "selected", groupId: "built-in", label: "Studio microphone" },
		]);
		expect(enumerateDevices).not.toHaveBeenCalled();
	});
	it("refreshes visible devices and bounds a pending Chromium request", async () => {
		vi.useFakeTimers();
		const { getRecordingAudioDevices } = await import("./recordingAudioDevices");
		const enumerateDevices = vi.fn(async () => [mic]);
		const known = await getRecordingAudioDevices({ enumerateDevices }, true);
		enumerateDevices.mockImplementation(() => new Promise(() => {}));
		const pending = getRecordingAudioDevices({ enumerateDevices }, true);
		await vi.advanceTimersByTimeAsync(1000);
		expect(await pending).toEqual(known);
		expect(vi.getTimerCount()).toBe(0);
	});
	it("falls back to known devices when enumeration fails", async () => {
		const { rememberRecordingAudioDevices, getRecordingAudioDevices } = await import(
			"./recordingAudioDevices"
		);
		rememberRecordingAudioDevices([mic]);
		const enumerateDevices = vi.fn(async () => {
			throw new Error("Unavailable");
		});
		expect(await getRecordingAudioDevices({ enumerateDevices }, true)).toHaveLength(1);
	});
});
