import { RECORDING_ZOOM_KEYS, type RecordingZoomSettings } from "@/types/recordingZoom";
import { shortcutWarning, type ShortcutPlatform } from "../studio/shortcuts";
export function zoomShortcutValue(settings: RecordingZoomSettings, platform: ShortcutPlatform) {
	return [
		settings.ctrl && "Control",
		settings.alt && "Alt",
		settings.shift && "Shift",
		settings.meta && (platform === "darwin" ? "Command" : "Super"),
		settings.key,
	]
		.filter(Boolean)
		.join("+");
}
export function zoomShortcutFromKey(
	event: {
		code: string;
		key: string;
		ctrlKey: boolean;
		altKey: boolean;
		shiftKey: boolean;
		metaKey: boolean;
	},
	settings: RecordingZoomSettings,
) {
	const key = /^Key[A-Z]$/.test(event.code)
		? event.code.slice(3)
		: /^Digit\d$/.test(event.code)
			? event.code.slice(5)
			: event.code === "Space"
				? "Space"
				: event.key.replace(/^Arrow/, "");
	return RECORDING_ZOOM_KEYS.includes(key)
		? {
				...settings,
				key,
				ctrl: event.ctrlKey,
				alt: event.altKey,
				shift: event.shiftKey,
				meta: event.metaKey,
			}
		: null;
}
export function zoomShortcutWarning(
	settings: RecordingZoomSettings,
	platform: ShortcutPlatform,
	assigned: Array<{ shortcut: string; name: string }>,
) {
	const warning = shortcutWarning(zoomShortcutValue(settings, platform), platform, assigned);
	if (warning && !warning.startsWith("Single-key")) return warning;
	if (!settings.ctrl && !settings.alt && !settings.meta) {
		const tools: Record<string, string> = {
			Z: "Zoom tool in some editors",
			V: "Selection tool",
			H: "Hand tool",
			R: "Rectangle tool",
			A: "Arrow tool",
			L: "Line tool",
			P: "Pencil tool",
			T: "Text tool",
			E: "Eraser tool",
			Space: "Playback / pan",
		};
		if (tools[settings.key])
			return `May overlap ${tools[settings.key]}. Bare keys also reach the active application.`;
	}
	return "";
}
