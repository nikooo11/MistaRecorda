import { useEffect, useRef, useState } from "react";
import { shortcutFromKey, shortcutWarning, type ShortcutPlatform } from "./shortcuts";
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
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value);
	const [ready, setReady] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const input = useRef<HTMLInputElement>(null);
	const warning = error || shortcutWarning(editing ? draft : value, platform, assigned);
	const format = (v: string) =>
		v
			.replace(/CommandOrControl/g, platform === "darwin" ? "⌘" : "Ctrl")
			.replace(/Command/g, "⌘")
			.replace(/Control/g, "Ctrl")
			.replace(/Super/g, "Win")
			.replace(/Alt/g, platform === "darwin" ? "⌥" : "Alt")
			.replace(/Shift/g, "⇧")
			.replace(/\+/g, " + ");
	useEffect(() => {
		if (!editing) return;
		let cancelled = false;
		void window.electronAPI.studio
			.request("shortcutCapture", true)
			.then(() => {
				if (!cancelled) {
					setReady(true);
					input.current?.focus();
				}
			})
			.catch(() => setError("Could not start shortcut capture."));
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
	const save = async () => {
		setSaving(true);
		setError("");
		try {
			await window.electronAPI.studio.request("shortcutCapture", false);
			await onChange(draft);
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
						warning || "Click, then press a new key combination. Save to apply it."
					}
					onClick={() => {
						setDraft(value);
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
						value={format(draft)}
						placeholder={ready ? "Press keys…" : "Preparing…"}
						disabled={!ready || saving}
						onKeyDown={(e) => {
							if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) return;
							e.preventDefault();
							e.stopPropagation();
							if (e.key === "Escape" && !e.altKey && !e.ctrlKey && !e.metaKey) {
								setEditing(false);
								return;
							}
							if (e.key === "Enter" && !e.altKey && !e.ctrlKey && !e.metaKey) {
								void save();
								return;
							}
							if (
								(e.key === "Backspace" || e.key === "Delete") &&
								!e.altKey &&
								!e.ctrlKey &&
								!e.metaKey
							) {
								setDraft("");
								setError("");
								return;
							}
							const next = shortcutFromKey(e, platform);
							if (next) {
								setDraft(next);
								setError("");
							}
						}}
					/>
					<div className="shortcut-actions">
						<button
							type="button"
							disabled={!ready || saving}
							onClick={() => void save()}
						>
							{saving ? "Saving…" : "Save"}
						</button>
						<button type="button" disabled={saving} onClick={() => setEditing(false)}>
							Cancel
						</button>
					</div>
				</>
			)}
			{warning && <small role="status">{warning}</small>}
			{editing && !warning && <small>Press keys · Enter saves · Esc cancels</small>}
		</div>
	);
}
