import { BrowserWindow } from "electron";
let show = false;
export function setStudioCaptureVisibility(value: boolean) {
	show = value;
	for (const window of BrowserWindow.getAllWindows()) {
		if (isStudio(window)) window.setContentProtection(!show);
	}
}
function isStudio(window: BrowserWindow) {
	return (
		new URL(window.webContents.getURL() || "about:blank").searchParams.get("windowType") ===
		"hud-overlay"
	);
}
export function studioCaptureWindowId() {
	if (!show) return undefined;
	const window = BrowserWindow.getAllWindows().find(isStudio);
	return window ? Number(window.getMediaSourceId().split(":")[1]) || undefined : undefined;
}
export function studioIsShownInCapture() {
	return show;
}
