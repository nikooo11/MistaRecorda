/** Presenter-only UI state. Never sent to the Mac canvas or saved with a scene. */
export type TabletPanelState = { collapsed: boolean; minimized: boolean; fullScreen: boolean };
export type TabletPanelAction = "collapse" | "minimize" | "dock" | "open" | "fullScreen";

export function changeTabletPanel(
	state: TabletPanelState,
	action: TabletPanelAction,
): TabletPanelState {
	if (action === "open" || (action === "dock" && state.minimized))
		return { collapsed: false, minimized: false, fullScreen: false };
	if (action === "minimize" || action === "dock")
		return { ...state, minimized: true, fullScreen: false };
	if (action === "fullScreen")
		return { collapsed: false, minimized: false, fullScreen: !state.fullScreen };
	return { collapsed: !state.collapsed, minimized: false, fullScreen: false };
}
