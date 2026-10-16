export function shouldHidePanel(visible: boolean, currentTab: string, requestedTab: string) {
	return visible && currentTab === requestedTab;
}

/** Tools are independent companion windows; opening one never dismisses another. */
export function showCapturePanel<
	T extends {
		isDestroyed(): boolean;
		show(): void;
		focus(): void;
		isMinimized?(): boolean;
		restore?(): void;
		setParentWindow?(parent: T | null): void;
		webContents: { getURL(): string };
	},
>(panel: T, windows: T[]) {
	const studio = windows.find((window) => {
		if (window === panel || window.isDestroyed()) return false;
		try {
			return (
				new URL(window.webContents.getURL()).searchParams.get("windowType") ===
				"hud-overlay"
			);
		} catch {
			return false;
		}
	});
	// Associate tools with the studio (including macOS Stage Manager) without
	// making them modal. The studio remains clickable and owns the recorder.
	if (studio && !studio.isMinimized?.()) {
		panel.setParentWindow?.(studio);
		studio.show();
	}
	if (panel.isMinimized?.()) panel.restore?.();
	panel.show();
	panel.focus();
}
