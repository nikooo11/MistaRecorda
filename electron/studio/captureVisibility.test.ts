import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ windows: [] as Array<ReturnType<typeof makeWindow>> }));
function makeWindow(title: string) {
	return { getTitle: () => title, setContentProtection: vi.fn() };
}
vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: () => state.windows } }));
import {
	protectAppWindow,
	setStudioCaptureVisibility,
	studioIsShownInCapture,
} from "./captureVisibility";

beforeEach(() => {
	state.windows = [];
	setStudioCaptureVisibility(false);
});

it("opts all existing app windows in and restores protection when disabled", () => {
	state.windows = ["Studio", "Capture settings", "Editor", "Presenter", "Zoom", "Tutorial"].map(
		makeWindow,
	);
	expect(studioIsShownInCapture()).toBe(false);
	setStudioCaptureVisibility(true);
	for (const window of state.windows)
		expect(window.setContentProtection).toHaveBeenLastCalledWith(false);
	setStudioCaptureVisibility(false);
	for (const window of state.windows)
		expect(window.setContentProtection).toHaveBeenLastCalledWith(true);
});

it("applies the current preference to windows opened after the toggle", () => {
	setStudioCaptureVisibility(true);
	const openedLater = makeWindow("Notes");
	protectAppWindow(openedLater as never);
	expect(openedLater.setContentProtection).toHaveBeenLastCalledWith(false);
	setStudioCaptureVisibility(false);
	protectAppWindow(openedLater as never);
	expect(openedLater.setContentProtection).toHaveBeenLastCalledWith(true);
});

it("keeps the clean drawing output recordable when app controls are hidden", () => {
	const surface = makeWindow("MistaRecorda Drawing Surface");
	state.windows = [surface];
	setStudioCaptureVisibility(false);
	expect(surface.setContentProtection).toHaveBeenLastCalledWith(false);
	protectAppWindow(surface as never, false);
	expect(surface.setContentProtection).toHaveBeenLastCalledWith(false);
});

it("keeps presenter notes and the private stream out even when app windows are enabled", () => {
	state.windows = [
		makeWindow("MistaRecorda Board Editor"),
		makeWindow("MistaRecorda Board Stream"),
        makeWindow("MistaRecorda Vertical Guide"),
	];
	setStudioCaptureVisibility(true);
	for (const window of state.windows)
		expect(window.setContentProtection).toHaveBeenLastCalledWith(true);
});
