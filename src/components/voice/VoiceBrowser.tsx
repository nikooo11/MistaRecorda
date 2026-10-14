import { useCallback, useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	defaultVoiceSettings,
	unwrapVoice,
	type VoiceInfo,
	type VoiceModel,
	type VoiceSettings,
} from "@/types/voice";
import type { PresetEntry, VoicePreset } from "@/types/voicePreset";
import { PresetEditor } from "./PresetEditor";
import { TrainedVoiceEditor } from "./TrainedVoiceEditor";
import { ArrowClockwiseIcon, DotsThreeIcon, StarIcon } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VoicePreviewButton } from "./VoicePreviewButton";
import { qualityLabel, modelLabel } from "./voiceModels";
type ImportItem = { preset: VoicePreset; status: string; rename: string };
export function VoiceBrowser({
	selectedVoiceId,
	applyingVoiceId,
	disabled = false,
	enabled = true,
	settings,
	models,
	onUseVoice,
	onUsePreset,
}: {
	selectedVoiceId: string;
	applyingVoiceId?: string;
	disabled?: boolean;
	enabled?: boolean;
	settings: VoiceSettings;
	models: VoiceModel[];
	onUseVoice: (voice: VoiceInfo) => Promise<void>;
	onUsePreset: (preset: VoicePreset) => Promise<void>;
}) {
	const t = useScopedT("settings");
	const [tab, setTab] = useState<"mine" | "library" | "favorites" | "presets">("mine");
	const [location, setLocation] = useState<"mine" | "team">("mine");
	const [search, setSearch] = useState("");
	const [gender, setGender] = useState("");
	const [accent, setAccent] = useState("");
	const [useCase, setUseCase] = useState("");
	const [voices, setVoices] = useState<VoiceInfo[]>([]);
	const [favorites, setFavorites] = useState<string[]>([]);
	const [presets, setPresets] = useState<PresetEntry[]>([]);
	const [editing, setEditing] = useState<VoicePreset | null>(null);
	const [trained, setTrained] = useState<VoiceInfo | null>(null);
	const [imports, setImports] = useState<ImportItem[]>([]);
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const [filters, setFilters] = useState(false);
	const [reload, setReload] = useState(0);
	const [loading, setLoading] = useState(false);
	const [team, setTeam] = useState("");
	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		setMessage("");
		try {
			await action();
		} catch (e) {
			setMessage(e instanceof Error ? e.message : "operationFailed");
		} finally {
			setBusy(false);
		}
	};
	const refresh = useCallback(() => {
		void Promise.all([
			window.electronAPI.voice.request("presets", undefined),
			window.electronAPI.voice.request("favorites", undefined),
			window.electronAPI.voice.request("getSettings", undefined),
		])
			.then(([p, f, s]) => {
				setPresets(unwrapVoice(p));
				setFavorites(unwrapVoice(f));
				setTeam(unwrapVoice(s).teamFolder);
			})
			.catch(() => setMessage("operationFailed"));
	}, []);
	const resolveImport = useCallback(
		async (preset: VoicePreset, rename?: string) => {
			try {
				const result = unwrapVoice(
					await window.electronAPI.voice.request("importPreset", { preset, rename }),
				);
				setImports((all) =>
					all.map((i) =>
						i.preset.id === preset.id ? { ...i, status: result.status } : i,
					),
				);
				refresh();
			} catch (e) {
				setImports((all) =>
					all.map((i) =>
						i.preset.id === preset.id
							? { ...i, status: e instanceof Error ? e.message : "operationFailed" }
							: i,
					),
				);
			}
		},
		[refresh],
	);
	const inspect = useCallback(
		async (input: { name: string; bytes: number[] } | undefined) => {
			try {
				const incoming = unwrapVoice(
					await window.electronAPI.voice.request("inspectImport", input),
				);
				setImports(
					incoming.map((preset) => ({ preset, status: "checkingAccess", rename: "" })),
				);
				for (const p of incoming) void resolveImport(p);
			} catch (e) {
				setMessage(e instanceof Error ? e.message : "operationFailed");
			}
		},
		[resolveImport],
	);
	useEffect(() => {
		refresh();
		const a = window.electronAPI.voice.onPresetsChanged(refresh);
		const b = window.electronAPI.voice.onImportRequested(() => void inspect(undefined));
		const params = new URLSearchParams(window.location.search);
		if (params.has("importPreset")) {
			params.delete("importPreset");
			window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
			void inspect(undefined);
		}
		return () => {
			a();
			b();
		};
	}, [refresh, inspect]);
	useEffect(() => {
		let disposed = false;
		// Reload is an explicit refresh revision, including unchanged searches.
		void reload;
		if (!enabled || tab === "presets") {
			setLoading(false);
			return;
		}
		setLoading(true);
		const timer = setTimeout(() => {
			void window.electronAPI.voice
				.request("browse", { tab, search, gender, accent, useCase })
				.then((r) => {
					if (!disposed) {
						setVoices(unwrapVoice(r));
						setMessage("");
					}
				})
				.catch((e) => {
					if (!disposed) {
						setVoices([]);
						setMessage(e.message);
					}
				})
				.finally(() => {
					if (!disposed) setLoading(false);
				});
		}, 250);
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, [tab, search, gender, accent, useCase, reload, enabled]);
	const makePreset = (voice: VoiceInfo) => {
		setTrained(null);
		const now = new Date().toISOString();
		const {
			modelId,
			stability,
			similarityBoost,
			style,
			useSpeakerBoost,
			removeBackgroundNoise,
			postFx,
		} = { ...defaultVoiceSettings, ...settings };
		setEditing({
			schema: "mistarecorda.voice-preset",
			version: 1,
			id: crypto.randomUUID(),
			name: voice.name,
			createdBy: "",
			createdAt: now,
			updatedAt: now,
			voice: {
				voiceId: voice.voiceId,
				source: voice.source,
				publicOwnerId: voice.publicOwnerId,
				originalName: voice.name,
				category: voice.category,
			},
			settings: {
				modelId,
				stability,
				similarityBoost,
				style,
				useSpeakerBoost,
				removeBackgroundNoise,
				postFx,
			},
			preview: { format: "wav", base64: "", text: "" },
			tags: [],
			isFavorite: favorites.includes(voice.voiceId),
		});
	};
	return (
		<section
			className="voice-browser"
			aria-label="Voice library"
			onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				e.preventDefault();
				const file = e.dataTransfer.files[0];
				if (!file) return;
				if (file.size > 100 * 1024 * 1024) {
					setMessage("presetTooLarge");
					return;
				}
				void file
					.arrayBuffer()
					.then((b) => inspect({ name: file.name, bytes: Array.from(new Uint8Array(b)) }))
					.catch(() => setMessage("operationFailed"));
			}}
		>
			<nav className="voice-tabs" aria-label="Voice sources">
				{(["mine", "library", "favorites", "presets"] as const).map((v) => (
					<button
						type="button"
						key={v}
						aria-pressed={tab === v}
						onClick={() => {
							setTab(v);
							setVoices([]);
						}}
						data-help={
							{
								mine: "Voices available in your ElevenLabs account.",
								library: "Find shared voices from the ElevenLabs library.",
								favorites: "Show voices you have starred.",
								presets: "Import, edit, and share saved voice settings.",
							}[v]
						}
					>
						{v === "mine" ? "My voices" : t(`voice.${v}`)}
					</button>
				))}
			</nav>
			<div className="voice-search-row">
				<input
					aria-label="Search voices"
					placeholder="Search voices…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				{tab === "library" && (
					<button
						type="button"
						aria-pressed={filters}
						onClick={() => setFilters(!filters)}
						data-help="Filter library voices by accent, gender, or use case."
					>
						Filters
					</button>
				)}
				<button
					type="button"
					aria-label="Refresh voices"
					disabled={loading}
					onClick={() => {
						refresh();
						setReload((n) => n + 1);
					}}
					data-help="Reload voices and presets."
				>
					<ArrowClockwiseIcon size={15} className={loading ? "voice-spin" : ""} />
				</button>
			</div>
			{tab === "library" && filters && (
				<div className="voice-filter-row">
					<input
						aria-label="Gender"
						placeholder="Gender"
						value={gender}
						onChange={(e) => setGender(e.target.value)}
					/>
					<input
						aria-label="Accent"
						placeholder="Accent"
						value={accent}
						onChange={(e) => setAccent(e.target.value)}
					/>
					<input
						aria-label="Use case"
						placeholder="Use case"
						value={useCase}
						onChange={(e) => setUseCase(e.target.value)}
					/>
				</div>
			)}
			{tab === "presets" && (
				<div className="voice-toolbar">
					<select
						aria-label="Preset location"
						value={location}
						onChange={(e) => setLocation(e.target.value as "mine" | "team")}
					>
						<option value="mine">My presets</option>
						<option value="team">Team presets</option>
					</select>
					<button
						type="button"
						disabled={busy}
						onClick={() =>
							void run(async () => {
								setTeam(
									unwrapVoice(
										await window.electronAPI.voice.request(
											"teamFolder",
											undefined,
										),
									),
								);
								refresh();
							})
						}
						data-help={team || "Choose a shared folder for team presets."}
					>
						Team folder
					</button>
					<button
						type="button"
						disabled={busy || !presets.length}
						onClick={() =>
							void run(async () => {
								const done = unwrapVoice(
									await window.electronAPI.voice.request("exportPreset", {
										preset: null,
										includeSamples: false,
										consent: false,
									}),
								);
								setMessage(done ? "Exported presets." : "Export cancelled.");
							})
						}
					>
						Export all
					</button>
				</div>
			)}
			<div className="voice-list" aria-label="Available voices" aria-busy={loading}>
				{loading && <p className="voice-empty">Loading voices…</p>}
				{!loading && tab !== "presets" && !voices.length && (
					<p className="voice-empty">
						{enabled
							? "No matching voices. Try another search or open Library."
							: "Connect ElevenLabs to browse voices."}
					</p>
				)}
				{tab !== "presets" &&
					voices.map((v) => (
						<article
							className="voice-row"
							key={v.voiceId}
							data-selected={selectedVoiceId === v.voiceId}
						>
							<VoicePreviewButton
								src={v.previewUrl}
								name={v.name}
								onError={setMessage}
							/>
							<div className="voice-row-name">
								<strong data-help={v.description || v.name}>{v.name}</strong>
								<small data-help={qualityLabel(v.highQualityModelIds)}>
									{v.category || v.source} · {qualityLabel(v.highQualityModelIds)}
								</small>
							</div>
							<button
								type="button"
								className="voice-use"
								disabled={disabled || busy || selectedVoiceId === v.voiceId}
								onClick={() => void onUseVoice(v)}
								data-help="Convert this recording’s microphone to this voice, then use it for playback and export."
							>
								{applyingVoiceId === v.voiceId
									? "Applying…"
									: selectedVoiceId === v.voiceId
										? "Selected"
										: "Use"}
							</button>
							<details className="voice-row-menu">
								<summary
									aria-label={`Actions for ${v.name}`}
									data-help="Favorite, save a preset, or edit a voice you own."
								>
									<DotsThreeIcon size={18} />
								</summary>
								<div>
									<button
										type="button"
										disabled={busy}
										onClick={() =>
											void run(async () => {
												setFavorites(
													unwrapVoice(
														await window.electronAPI.voice.request(
															"favorite",
															{
																voiceId: v.voiceId,
																name: v.name,
																enabled: !favorites.includes(
																	v.voiceId,
																),
															},
														),
													),
												);
												setReload((n) => n + 1);
											})
										}
									>
										<StarIcon
											size={13}
											weight={
												favorites.includes(v.voiceId) ? "fill" : "regular"
											}
										/>
										{favorites.includes(v.voiceId) ? "Unfavorite" : "Favorite"}
									</button>
									<button type="button" onClick={() => makePreset(v)}>
										Save preset…
									</button>
									<button
										type="button"
										disabled={!v.canEdit}
										onClick={() => {
											setEditing(null);
											setTrained(v);
										}}
										data-help={
											v.canEdit
												? "Edit this voice in your ElevenLabs account."
												: "Only voices you own can be edited."
										}
									>
										Edit owned voice…
									</button>
								</div>
							</details>
						</article>
					))}
				{tab === "presets" &&
					!presets.some(
						(e) =>
							e.location === location &&
							e.preset.name.toLowerCase().includes(search.toLowerCase()),
					) && (
						<p className="voice-empty">
							No presets here. Import a .mpvoice file or save a voice from the
							library.
						</p>
					)}
				{tab === "presets" &&
					presets
						.filter(
							(e) =>
								e.location === location &&
								e.preset.name.toLowerCase().includes(search.toLowerCase()),
						)
						.map(({ preset: p }) => (
							<article
								key={p.id}
								className="voice-row"
								data-selected={selectedVoiceId === p.voice.voiceId}
							>
								<VoicePreviewButton
									src={
										p.preview.base64
											? `data:audio/${p.preview.format};base64,${p.preview.base64}`
											: null
									}
									name={p.name}
									onError={setMessage}
								/>
								<div className="voice-row-name">
									<strong>{p.name}</strong>
									<small>{modelLabel(p.settings.modelId)} · Preset</small>
								</div>
								<button
									type="button"
									className="voice-use"
									disabled={disabled || busy}
									onClick={() => void onUsePreset(p)}
									data-help="Apply this preset’s voice and tuning to the microphone recording."
								>
									{applyingVoiceId === p.voice.voiceId ? "Applying…" : "Use"}
								</button>
								<button
									type="button"
									onClick={() => setEditing(p)}
									data-help="Modify, export, or share this preset."
								>
									Edit
								</button>
							</article>
						))}
				{imports.map((item) => (
					<article key={item.preset.id} className="border rounded p-3">
						<h3>{item.preset.name}</h3>
						{item.preset.preview.base64 && (
							<audio
								controls
								src={`data:audio/${item.preset.preview.format};base64,${item.preset.preview.base64}`}
							/>
						)}
						<p>
							{item.status === "askShare"
								? t("voice.askOwner", undefined, { owner: item.preset.createdBy })
								: t(`voice.${item.status}`)}
						</p>
						{item.status === "askShare" && (
							<button
								type="button"
								onClick={() =>
									void navigator.clipboard.writeText(
										`${item.preset.createdBy}: ${item.preset.voice.voiceId}`,
									)
								}
							>
								{t("voice.copyRequest")}
							</button>
						)}
						{item.status === "presetNameClash" && (
							<input
								className="voice-input"
								aria-label={t("voice.rename")}
								value={item.rename}
								onChange={(e) =>
									setImports((all) =>
										all.map((i) =>
											i === item ? { ...i, rename: e.target.value } : i,
										),
									)
								}
							/>
						)}
						<button
							type="button"
							disabled={item.status === "ready" || item.status === "checkingAccess"}
							onClick={() =>
								void resolveImport(item.preset, item.rename || undefined)
							}
						>
							{t("voice.retry")}
						</button>
					</article>
				))}
			</div>
			<div className="voice-browser-footer">
				<button
					type="button"
					disabled={busy}
					onClick={() => void inspect(undefined)}
					data-help="Import a .mpvoice preset. Presets contain voice settings, never API keys."
				>
					Import preset…
				</button>
				<span>
					{tab === "presets"
						? "Shared settings · your own API key"
						: "Preview first · Use to apply"}
				</span>
			</div>
			{message && (
				<p className="voice-status" role="status">
					{t(`voice.${message}`, message)}
				</p>
			)}
			<Dialog
				open={Boolean(editing || trained)}
				onOpenChange={(open) => {
					if (!open) {
						setEditing(null);
						setTrained(null);
					}
				}}
			>
				<DialogContent className="voice-studio voice-modal" aria-describedby={undefined}>
					<DialogTitle>{editing ? "Voice preset" : "Edit voice"}</DialogTitle>
					{editing && (
						<PresetEditor
							key={editing.id}
							initial={editing}
							models={models}
							onUse={onUsePreset}
							onSaved={refresh}
							onClose={() => setEditing(null)}
						/>
					)}
					{trained && (
						<TrainedVoiceEditor
							key={trained.voiceId}
							voice={trained}
							onSaved={(updated) => {
								setVoices((all) =>
									all.map((v) => (v.voiceId === updated.voiceId ? updated : v)),
								);
								setTrained(updated);
							}}
							onMakePreset={makePreset}
							onClose={() => setTrained(null)}
						/>
					)}
				</DialogContent>
			</Dialog>
		</section>
	);
}
