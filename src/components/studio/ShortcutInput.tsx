import { ShortcutGesture } from "./shortcutGesture";
import { zoomShortcutValue } from "../recording-zoom/zoomShortcut";
import { useEffect, useRef, useState } from "react";
import { formatShortcut, shortcutWarning, type ShortcutPlatform } from "./shortcuts";
export function ShortcutInput({
	value,
	onChange,
	disabled,
	label = "Keyboard shortcut",
	assigned = [],
}: {
	value: string;
	onChange: (value: string) => Promise<void>;
	disabled?: boolean;
	label?: string;
	assigned?: Array<{ shortcut: string; name: string }>;
}) {
	const platform: ShortcutPlatform = /Mac/.test(navigator.platform)
		? "darwin"
		: /Win/.test(navigator.platform)
			? "win32"
			: "linux";
	const [zoomBinding, setZoomBinding] = useState<Array<{ shortcut: string; name: string }>>([]);
	useEffect(() => {
		let disposed = false;
		void window.electronAPI.recordingZoom
			.getStatus()
			.then((status) => {
				if (!disposed && status.settings.enabled)
					setZoomBinding([
						{
							shortcut: zoomShortcutValue(status.settings, platform),
							name: "Hold to zoom",
						},
					]);
			})
			.catch(() => undefined);
		return () => {
			disposed = true;
		};
	}, [platform]);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value);
	const [ready, setReady] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const input = useRef<HTMLInputElement>(null);
	const gesture = useRef(new ShortcutGesture());
	const savingRef = useRef(false);
	useEffect(() => {
		if (editing && ready) input.current?.focus();
	}, [editing, ready]);
	const warning =
		error || shortcutWarning(editing ? draft : value, platform, [...assigned, ...zoomBinding]);
	const format = (value: string) => formatShortcut(value, platform === "darwin");
	useEffect(() => {
		if (!editing) return;
		let cancelled = false;
		void window.electronAPI.studio
			.request("shortcutCapture", true)
			.then(() => {
				if (!cancelled) {
					setReady(true);
				}
			})
			.catch((error) =>
				setError(
					error instanceof Error
						? error.message.replace(
								/^Error invoking remote method '[^']+': (?:Error: )?/,
								"",
							)
						: "Could not start shortcut capture.",
				),
			);
		const stop = () => setEditing(false);
		const timeout = setTimeout(stop, 55000);
		window.addEventListener("blur", stop);
		return () => {
			cancelled = true;
			clearTimeout(timeout);
			window.removeEventListener("blur", stop);
			void window.electronAPI.studio.request("shortcutCapture", false).catch(() => undefined);
		};
	}, [editing]);
	const save = async (shortcut: string) => {
		if (savingRef.current) return;
		savingRef.current = true;
		setSaving(true);
		setError("");
		try {
			await window.electronAPI.studio.request("shortcutCapture", false);
			await onChange(shortcut);
			setEditing(false);
		} catch (e) {
			setError(
				e instanceof Error
					? e.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")
					: "Shortcut unavailable.",
			);
			await window.electronAPI.studio.request("shortcutCapture", true).catch(() => undefined);
		} finally {
			setSaving(false);
			savingRef.current = false;
		}
	};
	return (
		<div className={`shortcut-editor ${warning ? "shortcut-conflict" : ""}`}>
			{!editing ? (
				<button
					type="button"
					className="shortcut-input"
					disabled={disabled}
					aria-label={`Change ${label}`}
					data-help={
						warning ||
						"Click, hold a key or combination, then release all keys to save."
					}
					onClick={() => {
						setDraft("");
						gesture.current.reset();
						setReady(false);
						setError("");
						setEditing(true);
					}}
				>
					{format(value) || "Set shortcut…"}
				</button>
			) : (
				<>
					<input
						ref={input}
						readOnly
						aria-label={label}
						className="shortcut-input"
						onBlur={(event) => {
							if (
								!event.currentTarget
									.closest(".shortcut-editor")
									?.contains(event.relatedTarget)
							)
								setEditing(false);
						}}
						value={format(draft)}
						placeholder={ready ? "Press keys…" : "Preparing…"}
						disabled={!ready || saving}
						onKeyDown={(e) => {
							if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) {
								setEditing(false);
								return;
							}
							e.preventDefault();
							e.stopPropagation();
							if (e.key === "Escape" && !e.altKey && !e.ctrlKey && !e.metaKey) {
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
							if (next.complete) void save(next.shortcut);
						}}
					/>
					<div className="shortcut-actions">
						<button
							type="button"
							disabled={!ready || saving}
							onClick={() => void save("")}
						>
							{saving ? "Saving…" : "Clear shortcut"}
						</button>
						<button type="button" disabled={saving} onClick={() => setEditing(false)}>
							Cancel
						</button>
					</div>
				</>
			)}
			{warning && <small role="status">{warning}</small>}
			{editing && !warning && <small>Hold keys · Release all to save · Esc cancels</small>}
		</div>
	);
}
