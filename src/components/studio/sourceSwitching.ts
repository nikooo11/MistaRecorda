import type { StudioInfo, StudioSource } from "../../types/studio";

export function isSelectedSource(target: StudioSource, selected?: StudioSource) {
	if (!selected || target.sourceType !== selected.sourceType) return false;
	if (target.sourceType === "screen" && target.display_id && selected.display_id)
		return target.display_id === selected.display_id;
	return (
		target.id === selected.id ||
		Boolean(
			target.sourceType === "window" &&
				target.appName &&
				target.windowTitle &&
				target.appName === selected.appName &&
				target.windowTitle === selected.windowTitle,
		)
	);
}

export function sourceSwitchUnavailable(
	info: Pick<StudioInfo, "recording" | "canSwitch" | "selectedSource">,
	target: StudioSource,
) {
	if (!info.recording || isSelectedSource(target, info.selectedSource)) return "";
	if (!info.canSwitch) return "Stop recording to change sources on this platform.";
	if (target.sourceType !== "window" || info.selectedSource?.sourceType !== "window")
		return "Stop recording to change displays. Window-to-window switching is available during a window recording.";
	return "";
}
