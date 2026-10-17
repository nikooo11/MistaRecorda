import { expect, test, vi } from "vitest";
import { RecordControlGate } from "./recordControls";
import { idleRecording } from "../../src/components/board/recordControlModel";
test("double taps and concurrent remotes send one command until Mac confirms", () => {
	const gate = new RecordControlGate(),
		send = vi.fn();
	gate.dispatch("start", idleRecording, send, 0);
	expect(() => gate.dispatch("start", idleRecording, send, 100)).toThrow("wait");
	expect(send).toHaveBeenCalledTimes(1);
	const live = { ...idleRecording, recording: true };
	gate.update(live);
	expect(() => gate.dispatch("start", live, send, 200)).toThrow("state changed");
	gate.dispatch("pause", live, send, 201);
	expect(send).toHaveBeenLastCalledWith("pause");
	gate.update({ ...live, paused: true });
	gate.dispatch("resume", { ...live, paused: true }, send, 300);
	expect(send).toHaveBeenCalledTimes(3);
});
test("missing HUD doesn't lock retries and failed start expires without toggling a running take", () => {
	const gate = new RecordControlGate();
	expect(() =>
		gate.dispatch(
			"start",
			idleRecording,
			() => {
				throw Error("No HUD");
			},
			0,
		),
	).toThrow("No HUD");
	const send = vi.fn();
	gate.dispatch("start", idleRecording, send, 1);
	gate.dispatch("start", idleRecording, send, 16002);
	expect(send).toHaveBeenCalledTimes(2);
	expect(() => gate.dispatch("stop", idleRecording, send, 17000)).toThrow("state changed");
});
