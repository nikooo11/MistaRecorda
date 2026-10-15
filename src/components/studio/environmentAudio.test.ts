import { expect, test } from "vitest";
import { defaultEnvironmentAudio, environmentAudioUnavailable } from "./environmentAudio";
test("new environments enable both inputs, and captured inputs can be muted and restored", () => {
	expect(defaultEnvironmentAudio).toEqual({ microphone: true, system: true });
	expect(
		environmentAudioUnavailable(
			{ microphone: false, system: false },
			defaultEnvironmentAudio,
			false,
		),
	).toBe("");
	expect(
		environmentAudioUnavailable(defaultEnvironmentAudio, defaultEnvironmentAudio, false),
	).toBe("");
});
test("never pretends to enable a track that was absent from the take", () => {
	expect(
		environmentAudioUnavailable(
			defaultEnvironmentAudio,
			{ microphone: false, system: true },
			false,
		),
	).toContain("started without");
	expect(
		environmentAudioUnavailable(
			defaultEnvironmentAudio,
			{ microphone: true, system: false },
			false,
		),
	).toContain("started without");
	expect(
		environmentAudioUnavailable(
			{ microphone: false, system: true },
			defaultEnvironmentAudio,
			true,
		),
	).toContain("Windows");
});
