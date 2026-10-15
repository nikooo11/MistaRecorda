import { ShortcutGesture } from "../studio/shortcutGesture";
import { useEffect, useRef, useState } from "react";
import { RECORDING_ZOOM_KEYS, type RecordingZoomSettings } from "@/types/recordingZoom";
import type { StudioInfo } from "@/types/studio";
import { formatShortcut, type ShortcutPlatform } from "../studio/shortcuts";
import { zoomShortcutValue, zoomShortcutWarning } from "./zoomShortcut";
export function ZoomShortcutInput({
	value,
	onChange,
	disabled,
}: {
	value: RecordingZoomSettings;
	onChange: (value: RecordingZoomSettings) => void;
	disabled?: boolean;
}) {
	const platform: ShortcutPlatform = /Mac/.test(navigator.platform)
		? "darwin"
		: /Win/.test(navigator.platform)
			? "win32"
			: "linux";
	const [editing, setEditing] = useState(false);
	const [ready, setReady] = useState(false);
	const [error, setError] = useState("");
	const [assigned, setAssigned] = useState<Array<{ shortcut: string; name: string }>>([]);
	const input = useRef<HTMLInputElement>(null);
	const gesture = useRef(new ShortcutGesture());
	const [draft, setDraft] = useState("");
	useEffect(() => {
		if (editing && ready) input.current?.focus();
	}, [editing, ready]);
	useEffect(() => {
		const apply = (info: StudioInfo) =>
			setAssigned([
				{ shortcut: info.settings.cameraShortcut, name: "Face camera" },
				...info.settings.windows.map((w) => ({
					shortcut: w.shortcut,
					name: `Window ${w.slot}: ${w.source.name}`,
				})),
				...info.settings.scenes.map((s) => ({
					shortcut: s.shortcut,
					name: `Scene: ${s.name}`,
				})),
				...info.settings.sounds.map((s) => ({
					shortcut: s.shortcut,
					name: `Sound: ${s.name}`,
				})),
			]);
		let disposed = false;
		void window.electronAPI.studio
			.request("info")
			.then((info) => {
				if (!disposed) apply(info);
			})
			.catch(() => setError("Could not check app shortcuts."));
		const off = window.electronAPI.studio.onChanged(apply);
		return () => {
			disposed = true;
			off();
		};
	}, []);
	useEffect(() => {
		if (!editing) return;
		let disposed = false;
		setReady(false);
		void window.electronAPI.studio
			.request("shortcutCapture", true)
			.then(() => {
				if (!disposed) {
					setReady(true);
				}
			})
			.catch((error) => {
				if (!disposed) {
					setError(
						error instanceof Error
							? error.message.replace(
									/^Error invoking remote method '[^']+': (?:Error: )?/,
									"",
								)
							: "Could not capture shortcut. Try again after recording stops.",
					);
					setEditing(false);
				}
			});
		const stop = () => setEditing(false);
		window.addEventListener("blur", stop);
		const timeout = setTimeout(stop, 55000);
		return () => {
			disposed = true;
			clearTimeout(timeout);
			window.removeEventListener("blur", stop);
			void window.electronAPI.studio.request("shortcutCapture", false).catch(() => undefined);
		};
	}, [editing]);
	const warning = error || zoomShortcutWarning(value, platform, assigned);
	return (
		<div className={`zoom-shortcut ${warning ? "zoom-shortcut-warning" : ""}`}>
			{editing ? (
				<input
					ref={input}
					aria-label="Press zoom shortcut"
					readOnly
					value={formatShortcut(draft, platform === "darwin")}
					placeholder={ready ? "Press a key or combination…" : "Preparing…"}
					disabled={!ready || disabled}
					onBlur={() => setEditing(false)}
					onKeyDown={(e) => {
						if (e.key === "Tab") {
							setEditing(false);
							return;
						}
						e.preventDefault();
						e.stopPropagation();
						if (e.key === "Escape") {
							setEditing(false);
							return;
						}
						const next = gesture.current.update(e, true, platform);
						setDraft(next.shortcut);
						setError(next.error);
					}}
					onKeyUp={(e) => {
						e.preventDefault();
						e.stopPropagation();
						const next = gesture.current.update(e, false, platform);
						if (!next.complete) return;
						const parts = next.shortcut.split("+");
						if (!RECORDING_ZOOM_KEYS.includes(parts[parts.length - 1])) {
							setError("Choose a letter, number, F1–F12, Space or arrow key.");
							return;
						}
						onChange({
							...value,
							key: parts[parts.length - 1],
							ctrl: parts.includes("Control"),
							alt: parts.includes("Alt"),
							shift: parts.includes("Shift"),
							meta: parts.includes("Command") || parts.includes("Super"),
						});
						setError("");
						setEditing(false);
					}}
				/>
			) : (
				<button
					type="button"
					aria-label="Change zoom shortcut"
					disabled={disabled}
					onClick={() => {
						setError("");
						setDraft("");
						gesture.current.reset();
						setEditing(true);
					}}
				>
					{formatShortcut(zoomShortcutValue(value, platform), platform === "darwin")}
				</button>
			)}
			<small role="status">
				{warning ||
					(editing
						? "Hold keys, then release all. Esc cancels."
						: "Click to change. Save below to apply.")}
			</small>
		</div>
	);
}
