import { useCallback, useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { defaultVoiceSettings, unwrapVoice, type VoiceInfo } from "@/types/voice";
import type { PresetEntry, VoicePreset } from "@/types/voicePreset";
import { PresetEditor } from "./PresetEditor";
import { TrainedVoiceEditor } from "./TrainedVoiceEditor";
type ImportItem = { preset: VoicePreset; status: string; rename: string };
export function VoiceBrowser() {
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
	const browse = () =>
		run(async () => {
			if (tab !== "presets")
				setVoices(
					unwrapVoice(
						await window.electronAPI.voice.request("browse", {
							tab,
							search,
							gender,
							accent,
							useCase,
						}),
					),
				);
			else refresh();
		});
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
		} = { ...defaultVoiceSettings, ...voice.defaultSettings };
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
			className="space-y-4 border-t pt-5"
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
					.then((b) =>
						inspect({ name: file.name, bytes: Array.from(new Uint8Array(b)) }),
					);
			}}
		>
			<h2 className="text-lg font-semibold">{t("voice.browser")}</h2>
			<p>{t("voice.presetLimit")}</p>
			<nav className="flex gap-3">
				{(["mine", "library", "favorites", "presets"] as const).map((v) => (
					<button
						className={tab === v ? "text-teal-400 underline" : ""}
						type="button"
						key={v}
						onClick={() => {
							setTab(v);
							setVoices([]);
						}}
					>
						{t(`voice.${v}`)}
					</button>
				))}
			</nav>
			<div className="flex flex-wrap gap-2">
				<input
					className="voice-input"
					aria-label={t("voice.search")}
					placeholder={t("voice.search")}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				{tab === "library" && (
					<>
						<input
							className="voice-input"
							aria-label={t("voice.gender")}
							placeholder={t("voice.gender")}
							value={gender}
							onChange={(e) => setGender(e.target.value)}
						/>
						<input
							className="voice-input"
							aria-label={t("voice.accent")}
							placeholder={t("voice.accent")}
							value={accent}
							onChange={(e) => setAccent(e.target.value)}
						/>
						<input
							className="voice-input"
							aria-label={t("voice.useCase")}
							placeholder={t("voice.useCase")}
							value={useCase}
							onChange={(e) => setUseCase(e.target.value)}
						/>
					</>
				)}
				<button type="button" disabled={busy} onClick={() => void browse()}>
					{t("voice.search")}
				</button>
			</div>
			<div className="flex flex-wrap gap-3">
				<button type="button" onClick={() => void inspect(undefined)}>
					{t("voice.import")}
				</button>
				<button
					type="button"
					onClick={() =>
						void run(async () => {
							unwrapVoice(
								await window.electronAPI.voice.request("exportPreset", {
									preset: null,
									includeSamples: false,
									consent: false,
								}),
							);
						})
					}
				>
					{t("voice.exportAll")}
				</button>
				<button
					type="button"
					onClick={() =>
						void run(async () => {
							setTeam(
								unwrapVoice(
									await window.electronAPI.voice.request("teamFolder", undefined),
								),
							);
							refresh();
						})
					}
				>
					{t("voice.teamFolder")}
				</button>
				<span>{team}</span>
			</div>
			{tab !== "presets" &&
				voices.map((v) => (
					<article className="border rounded p-3 space-y-2" key={v.voiceId}>
						<h3>
							{v.name} · {v.category}
						</h3>
						{v.previewUrl && <audio controls preload="none" src={v.previewUrl} />}
						<div className="flex gap-3">
							<button
								type="button"
								aria-label={t("voice.favorite")}
								aria-pressed={favorites.includes(v.voiceId)}
								onClick={() =>
									void run(async () =>
										setFavorites(
											unwrapVoice(
												await window.electronAPI.voice.request("favorite", {
													voiceId: v.voiceId,
													name: v.name,
													enabled: !favorites.includes(v.voiceId),
												}),
											),
										),
									)
								}
							>
								{favorites.includes(v.voiceId) ? "★" : "☆"}
							</button>
							<button
								type="button"
								onClick={() =>
									void run(async () => {
										const current = unwrapVoice(
											await window.electronAPI.voice.request(
												"getSettings",
												undefined,
											),
										);
										unwrapVoice(
											await window.electronAPI.voice.request("saveSettings", {
												...current,
												voiceId: v.voiceId,
												voiceName: v.name,
											}),
										);
										setMessage("presetApplied");
									})
								}
							>
								{t("voice.use")}
							</button>
							<button type="button" onClick={() => makePreset(v)}>
								{t("voice.makePreset")}
							</button>
							<span title={!v.canEdit ? t("voice.voiceNotOwned") : undefined}>
								<button
									type="button"
									disabled={!v.canEdit}
									onClick={() => {
										setEditing(null);
										setTrained(v);
									}}
								>
									{t("voice.editTrainedVoice")}
								</button>
							</span>
							{v.source === "library" && v.publicOwnerId && (
								<button
									type="button"
									onClick={() =>
										void run(async () => {
											unwrapVoice(
												await window.electronAPI.voice.request("addVoice", {
													owner: v.publicOwnerId!,
													voiceId: v.voiceId,
													name: v.name,
												}),
											);
											setMessage("saved");
										})
									}
								>
									{t("voice.addAccount")}
								</button>
							)}
						</div>
					</article>
				))}
			{tab === "presets" && (
				<>
					<nav className="flex gap-3">
						{(["mine", "team"] as const).map((v) => (
							<button type="button" key={v} onClick={() => setLocation(v)}>
								{t(`voice.${v}`)}
							</button>
						))}
					</nav>
					{presets
						.filter(
							(e) =>
								e.location === location &&
								e.preset.name.toLowerCase().includes(search.toLowerCase()),
						)
						.map(({ preset: p }) => (
							<article className="border rounded p-3 space-y-2" key={p.id}>
								<h3>
									{p.isFavorite ? "★ " : ""}
									{p.name}
								</h3>
								{p.preview.base64 && (
									<audio
										controls
										src={`data:audio/${p.preview.format};base64,${p.preview.base64}`}
									/>
								)}
								<button
									type="button"
									onClick={() =>
										void run(async () => {
											unwrapVoice(
												await window.electronAPI.voice.request(
													"usePreset",
													p,
												),
											);
											setMessage("presetApplied");
										})
									}
								>
									{t("voice.use")}
								</button>
								<button type="button" onClick={() => setEditing(p)}>
									{t("voice.editPreset")}
								</button>
							</article>
						))}
				</>
			)}
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
						onClick={() => void resolveImport(item.preset, item.rename || undefined)}
					>
						{t("voice.retry")}
					</button>
				</article>
			))}
			{editing && (
				<PresetEditor
					key={editing.id}
					initial={editing}
					onSaved={refresh}
					onClose={() => setEditing(null)}
				/>
			)}
			{trained && (
				<TrainedVoiceEditor
					key={trained.voiceId}
					voice={trained}
					onSaved={(updated) => {
						setVoices((current) =>
							current.map((v) => (v.voiceId === updated.voiceId ? updated : v)),
						);
						setTrained(updated);
					}}
					onMakePreset={makePreset}
					onClose={() => setTrained(null)}
				/>
			)}
			<p role="status">{busy ? t("voice.working") : message ? t(`voice.${message}`) : ""}</p>
		</section>
	);
}
