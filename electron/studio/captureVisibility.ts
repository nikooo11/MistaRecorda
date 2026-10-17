import { BrowserWindow } from "electron";

// Keep the persisted showStudioInCapture preference for existing installations.
// Its scope is now every app window, including windows created after the toggle.
let show = false;
export function protectAppWindow(window: BrowserWindow, protectedWhenHidden = true) {
	window.setContentProtection(protectedWhenHidden && !show);
}
export function setStudioCaptureVisibility(value: boolean) {
	show = value;
	for (const window of BrowserWindow.getAllWindows()) {
		protectAppWindow(window, window.getTitle() !== "MistaRecorda Drawing Surface");
	}
}
export function studioIsShownInCapture() {
	return show;
}
