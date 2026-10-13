import { afterEach, expect, test, vi } from "vitest";
import { IsolatedAudioCapture } from "./isolatedAudioCapture";
afterEach(() => vi.unstubAllGlobals());
test("browser capture records cloned mic and system independently and pauses both", async () => {
	const recorders: Array<Recorder> = [];
	class Stream {
		constructor(public tracks: unknown[]) {}
		getTracks() {
			return this.tracks;
		}
	}
	class Recorder {
		state = "inactive";
		mimeType = "audio/webm";
		ondataavailable?: (e: { data: Blob }) => void;
		onstop?: () => void;
		onerror?: () => void;
		constructor(public stream: Stream) {
			recorders.push(this);
		}
		start() {
			this.state = "recording";
		}
		pause() {
			this.state = "paused";
		}
		resume() {
			this.state = "recording";
		}
		stop() {
			this.state = "inactive";
			this.ondataavailable?.({ data: new Blob(["audio"]) });
			this.onstop?.();
		}
	}
	vi.stubGlobal("MediaStream", Stream);
	vi.stubGlobal("MediaRecorder", Recorder);
	const micClone = { stop: vi.fn() };
	const systemClone = { stop: vi.fn() };
	const mic = { clone: vi.fn(() => micClone) };
	const system = { clone: vi.fn(() => systemClone) };
	const capture = new IsolatedAudioCapture();
	capture.start(
		mic as unknown as MediaStreamTrack,
		system as unknown as MediaStreamTrack,
		performance.now(),
	);
	expect(recorders).toHaveLength(2);
	expect(recorders[0].stream.getTracks()).toEqual([micClone]);
	expect(recorders[1].stream.getTracks()).toEqual([systemClone]);
	capture.pause();
	expect(recorders.every((r) => r.state === "paused")).toBe(true);
	capture.resume();
	expect(recorders.every((r) => r.state === "recording")).toBe(true);
	const results = await capture.stop();
	expect(results.map((r) => r.kind)).toEqual(["mic", "system"]);
	expect(await results[0].data.text()).toBe("audio");
	expect(micClone.stop).toHaveBeenCalledOnce();
	expect(systemClone.stop).toHaveBeenCalledOnce();
	expect(await capture.stop()).toEqual([]);
});
