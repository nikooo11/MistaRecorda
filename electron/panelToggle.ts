export function shouldHidePanel(visible: boolean, currentTab: string, requestedTab: string) {
	return visible && currentTab === requestedTab;
}

/** Recorder tools share one active menu; drawing/camera surfaces stay visible. */
export function showCapturePanel<
	T extends {
		isDestroyed(): boolean;
		hide(): void;
		show(): void;
		focus(): void;
		webContents: { getURL(): string };
	},
>(panel: T, windows: T[]) {
	for (const other of windows) {
		if (other === panel || other.isDestroyed()) continue;
		const kind = new URL(other.webContents.getURL() || "about:blank").searchParams.get(
			"windowType",
		);
		if (["board-panel", "studio", "zoom-settings"].includes(kind ?? "")) other.hide();
	}
	panel.show();
	panel.focus();
}
