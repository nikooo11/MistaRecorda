import { HelpTarget, SettingHelp } from "../settings-guide/SettingHelp";
import { useEffect, useRef, useState } from "react";
import { MonitorIcon, AppWindowIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import type { StudioInfo, StudioSource } from "@/types/studio";
import { ShortcutInput } from "./ShortcutInput";
import { isSelectedSource, sourceSwitchUnavailable } from "./sourceSwitching";
export function LayerSources({
	info,
	sources,
	busy,
	run,
	saveShortcut,
	refresh,
}: {
	info: StudioInfo;
	sources: StudioSource[];
	busy: boolean;
	run: (method: string, input?: unknown) => Promise<void>;
	saveShortcut: (method: string, input: unknown) => Promise<void>;
	refresh: () => Promise<void>;
}) {
	const nextSlot = Array.from({ length: 64 }, (_, i) => i + 1).find(
		(n) => !info.settings.windows.some((w) => w.slot === n),
	);
	return (
		<HelpTarget id="sources">
			<section className="layer-sources" aria-label="Open screens and windows">
				<div className="capture-section-heading">
					<div>
						<h3>
							Screens & windows <SettingHelp id="sources" />
						</h3>
						<p>
							Click a preview to use it. Rename a source or release keys in its
							shortcut box to save.
						</p>
					</div>
					<button type="button" disabled={busy} onClick={() => void refresh()}>
						Refresh
					</button>
				</div>
				<div className="layer-source-list">
					{sources.map((source) => {
						const slot = info.settings.windows.find((w) =>
							isSelectedSource(w.source, source),
						);
						const label =
							info.settings.sourceAliases?.find((entry) =>
								isSelectedSource(entry.source, source),
							)?.name ?? source.name;
						const selected = isSelectedSource(source, info.selectedSource);
						const unavailable = sourceSwitchUnavailable(info, source);
						return (
							<div className="layer-source-row" key={source.id}>
								<div className="layer-source-identity">
									<button
										type="button"
										className="layer-source-name"
										aria-pressed={selected}
										disabled={busy || info.switching || !!unavailable}
										title={unavailable || source.name}
										aria-label={`Use ${label}`}
										onClick={() => void run("selectSource", source)}
									>
										<span className="layer-source-preview">
											{source.thumbnail &&
											source.thumbnail !== "data:image/png;base64," ? (
												<img
													src={source.thumbnail}
													alt={`${source.name} preview`}
												/>
											) : (
												<span>Preview unavailable</span>
											)}
										</span>
										<span className="layer-source-description">
											<strong>
												<span className="layer-source-icon">
													{source.appIcon ? (
														<img src={source.appIcon} alt="" />
													) : source.sourceType === "screen" ? (
														<MonitorIcon size={20} />
													) : (
														<AppWindowIcon size={20} />
													)}
												</span>
												{label}
											</strong>
											<small>
												{selected ? "Selected · " : ""}
												{source.sourceType === "screen"
													? "Display"
													: source.appName || "Application window"}
											</small>
										</span>
									</button>
									<SourceName
										source={source}
										label={label}
										disabled={busy}
										save={async (name) =>
											saveShortcut("renameSource", { source, name })
										}
									/>
								</div>
								<ShortcutInput
									label={`${label} shortcut`}
									value={slot?.shortcut ?? ""}
									disabled={busy || info.recording || (!slot && !nextSlot)}
									assigned={[
										{
											shortcut: info.settings.cameraShortcut,
											name: "Face camera",
										},
										...info.settings.windows
											.filter((w) => w.slot !== slot?.slot)
											.map((w) => ({
												shortcut: w.shortcut,
												name:
													info.settings.sourceAliases?.find((entry) =>
														isSelectedSource(entry.source, w.source),
													)?.name ?? w.source.name,
											})),
										...info.settings.scenes.map((s) => ({
											shortcut: s.shortcut,
											name: s.name,
										})),
										...info.settings.sounds.map((s) => ({
											shortcut: s.shortcut,
											name: s.name,
										})),
									]}
									onChange={async (shortcut) => {
										if (!shortcut && slot)
											await saveShortcut("removeWindow", slot.slot);
										else if (shortcut)
											await saveShortcut("assignWindow", {
												slot: slot?.slot ?? nextSlot,
												source,
												shortcut,
											});
									}}
								/>
							</div>
						);
					})}
				</div>
				{!sources.length && (
					<p className="capture-note">
						No sources found. Refresh after opening a screen or window.
					</p>
				)}
				<p className="shortcut-check-note">
					Previews update with Refresh. Yellow explains known conflicts. Other apps may
					reserve additional keys.
					{info.recording && " Stop recording to edit shortcuts or change displays."}
				</p>
			</section>
		</HelpTarget>
	);
}

function SourceName({
	source,
	label,
	disabled,
	save,
}: {
	source: StudioSource;
	label: string;
	disabled: boolean;
	save: (name: string) => Promise<void>;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(label);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [ready, setReady] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (!editing) return;
		let disposed = false;
		setReady(false);
		void window.electronAPI.studio
			.request("shortcutCapture", true)
			.then(() => {
				if (!disposed) setReady(true);
			})
			.catch(() => {
				if (!disposed) setError("Stop recording before renaming sources.");
			});
		return () => {
			disposed = true;
			void window.electronAPI.studio.request("shortcutCapture", false).catch(() => undefined);
		};
	}, [editing]);
	useEffect(() => {
		if (ready && editing) input.current?.focus();
	}, [ready, editing]);
	if (!editing)
		return (
			<button
				className="layer-source-rename"
				type="button"
				aria-label={`Rename ${label}`}
				title="Rename in MistaRecorda"
				disabled={disabled}
				onClick={() => {
					setDraft(label);
					setError("");
					setEditing(true);
				}}
			>
				<PencilSimpleIcon size={15} />
				Rename
			</button>
		);
	return (
		<form
			className="layer-source-rename-form"
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) setEditing(false);
			}}
			onSubmit={async (event) => {
				event.preventDefault();
				setSaving(true);
				setError("");
				try {
					await save(draft.trim());
					setEditing(false);
				} catch (error) {
					setError(error instanceof Error ? error.message : "Could not rename source.");
				} finally {
					setSaving(false);
				}
			}}
		>
			<input
				aria-label={`Name for ${source.name}`}
				ref={input}
				maxLength={80}
				value={draft}
				placeholder={source.name}
				disabled={saving || !ready}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						setEditing(false);
					}
				}}
			/>
			<button type="submit" disabled={saving || !ready}>
				{saving ? "Saving…" : "Save name"}
			</button>
			<button type="button" disabled={saving} onClick={() => setEditing(false)}>
				Cancel
			</button>
			{error && <small role="alert">{error}</small>}
		</form>
	);
}
