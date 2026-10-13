import { beforeEach, expect, test, vi } from "vitest";
import { defaultVoiceSettings, type VoiceSettings } from "../../../src/types/voice";
const mock = vi.hoisted(() => ({
	handlers: new Map<string, (input: unknown) => Promise<unknown>>(),
	getVoice: vi.fn(),
	editVoice: vi.fn(),
	read: vi.fn(),
	save: vi.fn(),
	notify: vi.fn(),
}));
vi.mock("electron", () => ({
	app: { getPath: () => "/tmp/mistarecorda-name-tests", on: vi.fn() },
	BrowserWindow: { getAllWindows: () => [] },
	dialog: {},
}));
vi.mock("./register", () => ({
	voiceHandle: (name: string, handler: (input: unknown) => Promise<unknown>) =>
		mock.handlers.set(name, handler),
	voiceClient: async () => ({ getVoice: mock.getVoice, editVoice: mock.editVoice }),
	voiceStore: () => ({ read: mock.read, save: mock.save }),
	notifyVoiceSettings: mock.notify,
}));
vi.mock("./job", () => ({ convertMicrophone: vi.fn() }));
import { registerPresetHandlers } from "./presetHandlers";
const request = () => ({
	voiceId: "owned-voice",
	name: "  Shared narrator É  ",
	description: "Narration",
	labels: {},
	settings: defaultVoiceSettings,
	addSamples: false,
	consent: false,
});
beforeEach(() => {
	vi.clearAllMocks();
	mock.handlers.clear();
	mock.getVoice.mockResolvedValue({ name: "Old voice", canEdit: true });
	mock.editVoice.mockResolvedValue(true);
	mock.read.mockResolvedValue({
		...defaultVoiceSettings,
		voiceId: "owned-voice",
		voiceName: "Old voice",
	});
	mock.save.mockImplementation(async (value: VoiceSettings) => value);
	registerPresetHandlers();
});
test("owned voice rename saves the normalized name and refreshes the selected voice label", async () => {
	await expect(mock.handlers.get("editVoice")!(request())).resolves.toBe(true);
	expect(mock.editVoice).toHaveBeenCalledWith(
		"owned-voice",
		expect.objectContaining({ name: "Shared narrator É" }),
		[],
	);
	expect(mock.save).toHaveBeenCalledWith(
		expect.objectContaining({ voiceName: "Shared narrator É" }),
	);
	expect(mock.notify).toHaveBeenCalledOnce();
});
test("voice rename preserves a separately named selected preset", async () => {
	mock.read.mockResolvedValue({
		...defaultVoiceSettings,
		voiceId: "owned-voice",
		voiceName: "Warm podcast preset",
	});
	await mock.handlers.get("editVoice")!(request());
	expect(mock.save).not.toHaveBeenCalled();
});
test("failed or unauthorized remote renames do not claim a saved local name", async () => {
	mock.editVoice.mockRejectedValueOnce(new Error("noAccess"));
	await expect(mock.handlers.get("editVoice")!(request())).rejects.toThrow("noAccess");
	expect(mock.save).not.toHaveBeenCalled();
	mock.getVoice.mockResolvedValue({ canEdit: false });
	await expect(mock.handlers.get("editVoice")!(request())).rejects.toThrow("voiceNotOwned");
	expect(mock.editVoice).toHaveBeenCalledTimes(1);
});
test("blank names are rejected before the voice API is called", async () => {
	await expect(mock.handlers.get("editVoice")!({ ...request(), name: "   " })).rejects.toThrow(
		"invalidSettings",
	);
	expect(mock.getVoice).not.toHaveBeenCalled();
});
