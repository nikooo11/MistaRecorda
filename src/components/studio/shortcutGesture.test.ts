import { expect, test } from "vitest";
import { shortcutSchema, studioSettingsSchema } from "../../../electron/studio/model";
import { ShortcutGesture, type ShortcutKeyEvent } from "./shortcutGesture";
const key = (code: string, extra: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent => ({
	code,
	key: code.startsWith("Key") ? code.slice(3).toLowerCase() : code.replace(/Left$/, ""),
	metaKey: false,
	ctrlKey: false,
	altKey: false,
	shiftKey: false,
	...extra,
});
test("single keys save only on release and satisfy backend validation", () => {
	const g = new ShortcutGesture();
	expect(g.update(key("KeyA"), true, "darwin").complete).toBe(false);
	expect(g.update(key("KeyA"), false, "darwin")).toMatchObject({ complete: true, shortcut: "A" });
	expect(shortcutSchema.parse("A")).toBe("A");
	expect(shortcutSchema.parse("F8")).toBe("F8");
});
test("waits for every modifier release and retains the full chord", () => {
	const g = new ShortcutGesture();
	g.update(key("ControlLeft", { ctrlKey: true }), true, "win32");
	g.update(key("AltLeft", { ctrlKey: true, altKey: true }), true, "win32");
	expect(g.update(key("KeyK", { ctrlKey: true, altKey: true }), true, "win32").shortcut).toBe(
		"Control+Alt+K",
	);
	expect(g.update(key("KeyK", { ctrlKey: true, altKey: true }), false, "win32").complete).toBe(
		false,
	);
	expect(g.update(key("ControlLeft", { altKey: true }), false, "win32").complete).toBe(false);
	expect(g.update(key("AltLeft"), false, "win32")).toMatchObject({
		complete: true,
		shortcut: "Control+Alt+K",
	});
});
test("supports modifiers pressed after the primary and released before it", () => {
	const g = new ShortcutGesture();
	g.update(key("KeyK"), true, "win32");
	g.update(key("ShiftLeft", { shiftKey: true }), true, "win32");
	expect(g.update(key("ShiftLeft"), false, "win32").complete).toBe(false);
	expect(g.update(key("KeyK"), false, "win32")).toMatchObject({
		complete: true,
		shortcut: "Shift+K",
	});
});
test("macOS Command release completes a chord whose letter keyup was suppressed", () => {
	const g = new ShortcutGesture();
	g.update(key("MetaLeft", { metaKey: true }), true, "darwin");
	g.update(key("KeyK", { metaKey: true }), true, "darwin");
	expect(g.update(key("MetaLeft"), false, "darwin")).toMatchObject({
		complete: true,
		shortcut: "Command+K",
	});
});
test("multiple ordinary keys explain the platform limit and never silently save one", () => {
	const g = new ShortcutGesture();
	g.update(key("KeyA"), true, "darwin");
	expect(g.update(key("KeyB"), true, "darwin").error).toContain("one letter");
	g.update(key("KeyA"), false, "darwin");
	expect(g.update(key("KeyB"), false, "darwin").complete).toBe(false);
	g.update(key("F8"), true, "darwin");
	expect(g.update(key("F8"), false, "darwin").complete).toBe(true);
});
test("source aliases persist separately from matching identity and strip preview pixels", () => {
	const source = {
		id: "window:1:0",
		name: "Google Chrome — News",
		appName: "Google Chrome",
		windowTitle: "News",
		sourceType: "window",
		thumbnail: "pixels",
	};
	const result = studioSettingsSchema.parse({
		glow: false,
		windows: [],
		sounds: [],
		sourceAliases: [{ source, name: "My article" }],
	});
	expect(result.sourceAliases[0].name).toBe("My article");
	expect(result.sourceAliases[0].source.windowTitle).toBe("News");
	expect(result.sourceAliases[0].source).not.toHaveProperty("thumbnail");
});

test("native release flags clear modifiers even when their individual keyups are coalesced", () => {
	const g = new ShortcutGesture();
	g.update(key("MetaLeft", { metaKey: true }), true, "darwin");
	g.update(key("AltLeft", { metaKey: true, altKey: true }), true, "darwin");
	g.update(key("Digit1", { key: "1", metaKey: true, altKey: true }), true, "darwin");
	expect(g.update(key("Digit1", { key: "1" }), false, "darwin")).toMatchObject({
		complete: true,
		shortcut: "Command+Alt+1",
	});
});
