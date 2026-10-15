import { describe, expect, test } from "vitest";
import { normalizeShortcut, shortcutFromKey, shortcutWarning } from "./shortcuts";
describe("shortcut editing", () => {
	test("normalizes modifier ordering and platform aliases", () => {
		expect(normalizeShortcut("Shift+CommandOrControl+A", "darwin")).toBe(
			normalizeShortcut("Command+Shift+A", "darwin"),
		);
		expect(normalizeShortcut("CommandOrControl+A", "win32")).toBe("control+a");
	});
	test("flags recorder keys and window/sound overlaps", () => {
		expect(shortcutWarning("Command+Shift+R", "darwin", [])).toContain("Start / stop");
		expect(
			shortcutWarning("Alt+Control+1", "win32", [
				{ shortcut: "Control+Alt+1", name: "Window 2" },
			]),
		).toContain("Window 2");
	});
	test("reports OS-specific known conflicts", () => {
		expect(shortcutWarning("Command+Shift+4", "darwin", [])).toContain("Screenshot");
		expect(shortcutWarning("Super+L", "win32", [])).toContain("Lock screen");
		expect(shortcutWarning("Control+Alt+8", "darwin", [])).toBe("");
	});
	test("keeps Mac Command and Control distinct and supports both", () => {
		expect(
			shortcutFromKey(
				{
					key: "a",
					code: "KeyA",
					metaKey: true,
					ctrlKey: true,
					altKey: false,
					shiftKey: false,
				},
				"darwin",
			),
		).toBe("Command+Control+A");
	});
	test("uses physical letter for Option chords instead of dead character", () => {
		expect(
			shortcutFromKey(
				{
					key: "Dead",
					code: "KeyE",
					metaKey: true,
					ctrlKey: false,
					altKey: true,
					shiftKey: false,
				},
				"darwin",
			),
		).toBe("Command+Alt+E");
	});
	test("accepts a single key when explicitly capturing a hotkey", () => {
		expect(
			shortcutFromKey(
				{
					key: "a",
					code: "KeyA",
					metaKey: false,
					ctrlKey: false,
					altKey: false,
					shiftKey: false,
				},
				"darwin",
			),
		).toBe("A");
	});
});
