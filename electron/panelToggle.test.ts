import { expect, test, vi } from "vitest";
import { shouldHidePanel, showCapturePanel } from "./panelToggle";
test("a panel button closes its visible panel, but opens a different tab", () => {
	expect(shouldHidePanel(true, "ipad", "ipad")).toBe(true);
	expect(shouldHidePanel(false, "ipad", "ipad")).toBe(false);
	expect(shouldHidePanel(true, "ipad", "draw")).toBe(false);
});

test("opening an iPad companion keeps the studio and all other tools available", () => {
	const window = (kind: string) => ({
		isDestroyed: () => false,
		hide: vi.fn(),
		show: vi.fn(),
		focus: vi.fn(),
		setParentWindow: vi.fn(),
		webContents: { getURL: () => `http://localhost/?windowType=${kind}` },
	});
	const board = window("board-panel"),
		studio = window("studio"),
		zoom = window("zoom-settings"),
		camera = window("camera-overlay"),
		drawing = window("board-surface"),
		hud = window("hud-overlay");
	showCapturePanel(board, [board, studio, zoom, camera, drawing, hud]);
	expect(board.show).toHaveBeenCalledOnce();
	expect(board.focus).toHaveBeenCalledOnce();
	expect(board.setParentWindow).toHaveBeenCalledWith(hud);
	expect(hud.show).toHaveBeenCalledOnce();
	for (const w of [board, studio, zoom, camera, drawing, hud])
		expect(w.hide).not.toHaveBeenCalled();
});

test("opening a utility preserves deliberate studio minimization and restores the utility", () => {
	const window = (kind: string) => ({
		isDestroyed: () => false,
		isMinimized: () => true,
		show: vi.fn(),
		focus: vi.fn(),
		restore: vi.fn(),
		setParentWindow: vi.fn(),
		webContents: { getURL: () => `file:///index.html?windowType=${kind}` },
	});
	const studio = window("hud-overlay"),
		settings = window("studio");
	showCapturePanel(settings, [studio, settings]);
	expect(studio.show).not.toHaveBeenCalled();
	expect(settings.restore).toHaveBeenCalledOnce();
	expect(settings.show).toHaveBeenCalledOnce();
});
