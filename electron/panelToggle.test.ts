import { expect, test, vi } from "vitest";
import { shouldHidePanel, showCapturePanel } from "./panelToggle";
test("a panel button closes its visible panel, but opens a different tab", () => {
	expect(shouldHidePanel(true, "ipad", "ipad")).toBe(true);
	expect(shouldHidePanel(false, "ipad", "ipad")).toBe(false);
	expect(shouldHidePanel(true, "ipad", "draw")).toBe(false);
});

test("switching recorder tools closes the previous menu without hiding capture surfaces", () => {
	const window = (kind: string) => ({
		isDestroyed: () => false,
		hide: vi.fn(),
		show: vi.fn(),
		focus: vi.fn(),
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
	expect(studio.hide).toHaveBeenCalledOnce();
	expect(zoom.hide).toHaveBeenCalledOnce();
	for (const w of [board, camera, drawing, hud]) expect(w.hide).not.toHaveBeenCalled();
});
