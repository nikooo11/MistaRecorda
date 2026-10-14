export type ShortcutPlatform = "darwin" | "win32" | "linux";
export function normalizeShortcut(shortcut: string, platform: ShortcutPlatform) {
	const parts = shortcut.toLowerCase().split("+");
	const key = (parts.pop() || "").replace(/^arrow/, "");
	const modifiers = parts.map((p) =>
		p === "commandorcontrol" ? (platform === "darwin" ? "command" : "control") : p,
	);
	return [...new Set(modifiers)].sort().concat(key).join("+");
}
export const recorderShortcuts = [
	{ shortcut: "CommandOrControl+Shift+H", name: "Show / hide recorder" },
	{ shortcut: "CommandOrControl+Shift+B", name: "Drawing board" },
	{ shortcut: "CommandOrControl+Shift+R", name: "Start / stop recording" },
	{ shortcut: "CommandOrControl+Shift+P", name: "Pause / resume" },
];
const common = {
	A: "Select all",
	C: "Copy",
	V: "Paste",
	X: "Cut",
	Z: "Undo",
	S: "Save",
	O: "Open",
	N: "New window",
	P: "Print",
	F: "Find",
	W: "Close window",
	Q: "Quit",
};
export function shortcutWarning(
	shortcut: string,
	platform: ShortcutPlatform,
	assigned: Array<{ shortcut: string; name: string }>,
) {
	if (!shortcut) return "";
	const normalized = normalizeShortcut(shortcut, platform);
	const duplicate = [...recorderShortcuts, ...assigned].find(
		(b) => normalizeShortcut(b.shortcut, platform) === normalized,
	);
	if (duplicate) return `Already assigned to ${duplicate.name}. Choose another shortcut.`;
	const known: Array<{ shortcut: string; name: string }> = Object.entries(common).map(
		([key, name]) => ({ shortcut: `CommandOrControl+${key}`, name }),
	);
	if (platform === "darwin")
		known.push(
			{ shortcut: "Command+Space", name: "Spotlight" },
			{ shortcut: "Command+Tab", name: "Switch apps" },
			{ shortcut: "Command+Alt+Escape", name: "Force Quit" },
			{ shortcut: "Control+Command+Q", name: "Lock screen" },
			...[3, 4, 5].map((n) => ({
				shortcut: `Command+Shift+${n}`,
				name: "Screenshot / screen recording",
			})),
			{ shortcut: "Control+ArrowUp", name: "Mission Control" },
			{ shortcut: "Control+ArrowDown", name: "App windows" },
			{ shortcut: "Command+H", name: "Hide app" },
			{ shortcut: "Command+M", name: "Minimize window" },
		);
	if (platform === "win32")
		known.push(
			{ shortcut: "Alt+Tab", name: "Switch apps" },
			{ shortcut: "Alt+F4", name: "Close app" },
			{ shortcut: "Control+Shift+Escape", name: "Task Manager" },
			{ shortcut: "Control+Alt+Delete", name: "Security screen" },
			...Object.entries({
				L: "Lock screen",
				D: "Show desktop",
				E: "File Explorer",
				R: "Run",
				I: "Settings",
				S: "Search",
				Tab: "Task view",
			}).map(([key, name]) => ({ shortcut: `Super+${key}`, name })),
			{ shortcut: "Super+Shift+S", name: "Screenshot" },
		);
	const conflict = known.find((b) => normalizeShortcut(b.shortcut, platform) === normalized);
	if (conflict)
		return `May overlap ${conflict.name} (${platform === "darwin" ? "macOS" : platform === "win32" ? "Windows" : "common app shortcut"}).`;
	if (platform === "win32" && normalized.includes("super"))
		return "The Windows key is used by many system shortcuts. Check this combination before saving.";
	return "";
}
export function shortcutFromKey(
	event: {
		key: string;
		code: string;
		metaKey: boolean;
		ctrlKey: boolean;
		altKey: boolean;
		shiftKey: boolean;
	},
	platform: ShortcutPlatform,
) {
	const key = /^Key[A-Z]$/.test(event.code)
		? event.code.slice(3)
		: /^Digit[0-9]$/.test(event.code)
			? event.code.slice(5)
			: event.code === "Space"
				? "Space"
				: event.key;
	if (
		!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Space|Tab|Escape|Enter|Arrow(?:Up|Down|Left|Right)|Delete|Backspace)$/.test(
			key,
		) ||
		!(event.metaKey || event.ctrlKey || event.altKey)
	)
		return "";
	return [
		...(event.metaKey ? [platform === "darwin" ? "Command" : "Super"] : []),
		...(event.ctrlKey ? ["Control"] : []),
		...(event.altKey ? ["Alt"] : []),
		...(event.shiftKey ? ["Shift"] : []),
		key.replace(/^Arrow/, ""),
	].join("+");
}
