import { expect, test } from "vitest";
import { defaultRecordingZoomSettings } from "@/types/recordingZoom";
import { zoomShortcutFromKey, zoomShortcutWarning } from "./zoomShortcut";
const key = {
	code: "KeyE",
	key: "Dead",
	ctrlKey: false,
	metaKey: true,
	altKey: true,
	shiftKey: false,
};
test("captures physical keys including Option chords and bare keys", () => {
	expect(zoomShortcutFromKey(key, defaultRecordingZoomSettings)).toMatchObject({
		key: "E",
		meta: true,
		alt: true,
	});
	expect(
		zoomShortcutFromKey(
			{ ...key, code: "KeyZ", metaKey: false, altKey: false },
			defaultRecordingZoomSettings,
		),
	).toMatchObject({ key: "Z", meta: false, alt: false });
	expect(
		zoomShortcutFromKey({ ...key, code: "Digit7", key: "7" }, defaultRecordingZoomSettings)
			?.key,
	).toBe("7");
	expect(
		zoomShortcutFromKey(
			{ ...key, code: "Escape", key: "Escape" },
			defaultRecordingZoomSettings,
		),
	).toBeNull();
});
test("names app and operating-system overlaps", () => {
	expect(
		zoomShortcutWarning(
			{ ...defaultRecordingZoomSettings, key: "4", meta: true, shift: true },
			"darwin",
			[],
		),
	).toContain("Screenshot");
	expect(
		zoomShortcutWarning({ ...defaultRecordingZoomSettings, key: "L", meta: true }, "win32", []),
	).toContain("Lock screen");
	expect(
		zoomShortcutWarning({ ...defaultRecordingZoomSettings, key: "7", ctrl: true }, "darwin", [
			{ shortcut: "Control+7", name: "Window 2: Browser" },
		]),
	).toContain("Window 2: Browser");
});
