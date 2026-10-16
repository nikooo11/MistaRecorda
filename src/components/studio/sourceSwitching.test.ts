import { expect, test } from "vitest";
import { isSelectedSource, sourceSwitchUnavailable } from "./sourceSwitching";
import type { StudioSource } from "../../types/studio";
const window: StudioSource = {
	id: "window:3:0",
	name: "Notes",
	appName: "Notes",
	windowTitle: "Script",
	sourceType: "window",
};
const screen: StudioSource = {
	id: "screen:1:0",
	name: "Display",
	display_id: "12",
	sourceType: "screen",
};
test("active labels track source identity rather than duplicate display names", () => {
	expect(isSelectedSource(window, { ...window, id: "window:5:0" })).toBe(true);
	expect(isSelectedSource(window, { ...window, id: "window:6:0", windowTitle: "Other" })).toBe(
		false,
	);
	expect(isSelectedSource(screen, { ...screen, id: "screen:8:0" })).toBe(true);
	expect(isSelectedSource(screen, { ...screen, display_id: "13" })).toBe(false);
	expect(isSelectedSource(window)).toBe(false);
});
test("only supported live switches are offered; idle source recall works on every platform", () => {
	const state = { recording: true, canSwitch: true, selectedSource: window };
	expect(
		sourceSwitchUnavailable(state, { ...window, id: "window:7:0", windowTitle: "Other" }),
	).toBe("");
	expect(sourceSwitchUnavailable(state, screen)).toBe("");
	expect(sourceSwitchUnavailable({ ...state, selectedSource: screen }, window)).toBe("");
	expect(sourceSwitchUnavailable({ ...state, canSwitch: false }, screen)).toContain("platform");
	expect(sourceSwitchUnavailable({ ...state, canSwitch: false, recording: false }, screen)).toBe(
		"",
	);
	expect(sourceSwitchUnavailable({ ...state, canSwitch: false }, window)).toBe("");
});
