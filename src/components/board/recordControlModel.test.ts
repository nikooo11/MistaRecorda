import { expect, test } from "vitest";
import {
	idleRecording,
	intentAllowed,
	needsStopConfirmation,
	pauseIntent,
	recordIntent,
	recordingTime,
	recordingCorner,
} from "./recordControlModel";
test("controls follow authoritative Mac status, including paused takes", () => {
	expect(recordIntent(idleRecording)).toBe("start");
	expect(pauseIntent(idleRecording)).toBeUndefined();
	const live = { ...idleRecording, recording: true, elapsed: 12 };
	expect(recordIntent(live)).toBe("stop");
	expect(pauseIntent(live)).toBe("pause");
	expect(pauseIntent({ ...live, paused: true })).toBe("resume");
	expect(intentAllowed(live, "start")).toBe(false);
	expect(intentAllowed(idleRecording, "stop")).toBe(false);
	expect(intentAllowed(idleRecording, "resume")).toBe(false);
	expect(needsStopConfirmation(live, true)).toBe(true);
	expect(needsStopConfirmation(live, false)).toBe(false);
	expect(needsStopConfirmation({ ...live, elapsed: 4 }, true)).toBe(false);
	expect(recordingTime(125.8)).toBe("02:05");
	expect(recordingCorner("bad")).toBe("bottom-right");
});
