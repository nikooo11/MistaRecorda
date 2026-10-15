/** BrowserWindow.webContents throws after its native window has closed. */
export function ownsShortcutCapture<T>(
	panel: { isDestroyed(): boolean; webContents: T } | undefined,
	sender: T,
) {
	return !!panel && !panel.isDestroyed() && panel.webContents === sender;
}
