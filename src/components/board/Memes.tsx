import { SHADOW_HELP } from "./shadowObjects";
import { presenterId } from "./presenterModel";
import { useEffect, useState, useRef } from "react";
import { HeartIcon, StarIcon, GearSixIcon } from "@phosphor-icons/react";
import { createPortal } from "react-dom";
import { dragObject, type ObjectRect } from "./objectPlacement";
import { matchingMemes } from "./memePreferences";
import { MemePreviewButton } from "./MemePreviewButton";
import type { BoardAPI, BoardState } from "../../types/board";
import type { MemeAsset, MemeTransition, PlacedMeme } from "../../types/memes";
import { DEFAULT_MEME_PLAYBACK } from "../../types/memes";
import type { SoundEffect } from "../../types/studio";

const transitions: MemeTransition[] = ["none", "fade", "spin", "fall"];
export function MemeLibrary({
	transport,
	state,
	onChoose,
	onClose,
	initialEditId,
	onDragPreview,
}: {
	transport: BoardAPI;
	state: BoardState;
	onChoose: (asset: MemeAsset, client?: { x: number; y: number }) => void;
	onDragPreview?: (asset: MemeAsset, client: { x: number; y: number }) => void;
	onClose: () => void;
	initialEditId?: string;
}) {
	const [edit, setEdit] = useState<MemeAsset | undefined>(() =>
		state.memes?.find((m) => m.id === initialEditId),
	);
	const [sounds, setSounds] = useState<SoundEffect[]>([]);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [query, setQuery] = useState("");
	const [tagDraft, setTagDraft] = useState(
		() => state.memes?.find((m) => m.id === initialEditId)?.tags?.join(", ") ?? "",
	);
	const preference = async (id: string, kind: "love" | "favorite", value: boolean) => {
		setBusy(true);
		setError("");
		try {
			await transport.request("setMemePreference", { id, kind, value });
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	};
	useEffect(() => {
		void transport
			.request<{ sounds: SoundEffect[] }>("soundboard")
			.then((r) => setSounds(r.sounds))
			.catch((e) => setError(String(e)));
	}, [transport]);
	const save = async (asset: MemeAsset) => {
		setBusy(true);
		setError("");
		try {
			await transport.request("saveMeme", asset);
			setEdit(undefined);
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	};
	return (
		<aside className="board-tray meme-library" aria-label="Memes">
			<header>
				<strong>Memes</strong>
				<button onClick={onClose}>Close</button>
			</header>
			<details className="meme-help">
				<summary>Placement, loves & favorites</summary>
				<p>
					Tap a meme or drag its thumbnail onto the canvas. Move and resize the 50%
					preview, then press Deploy. Sound and effects start only after deployment.
				</p>
				<p className="meme-preference-help">
					♥ Love keeps a meme at the top across projects. ★ Favorites are for this take or
					saved environment. They reset when recording stops.
				</p>
			</details>
			<label className="board-import">
				＋ Import image or GIF
				<input
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif"
					disabled={busy}
					onChange={async (e) => {
						const file = e.target.files?.[0];
						e.target.value = "";
						if (!file) return;
						if (file.size > 12 * 1024 * 1024) {
							setError("Choose an image or GIF under 12 MB.");
							return;
						}
						try {
							const dataURL = await new Promise<string>((resolve, reject) => {
								const r = new FileReader();
								r.onload = () => resolve(String(r.result));
								r.onerror = reject;
								r.readAsDataURL(file);
							});
							const image = new Image();
							image.src = dataURL;
							await image.decode();
							await save({
								id: presenterId(),
								name: file.name.replace(/\.[^.]+$/, "").slice(0, 80),
								dataURL,
								width: image.naturalWidth,
								height: image.naturalHeight,
								...DEFAULT_MEME_PLAYBACK,
								soundId: "",
							});
						} catch {
							setError("Could not import that image.");
						}
					}}
				/>
			</label>
			<input
				type="search"
				className="meme-search"
				aria-label="Find memes"
				placeholder="Find memes: stupid, celebrate, surprised…"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
			/>
			<div className="meme-grid">
				{matchingMemes(state, query).map((asset) => (
					<div key={asset.id}>
						<MemePreviewButton
							asset={asset}
							soundName={sounds.find((s) => s.id === asset.soundId)?.name}
							onDragPreview={
								onDragPreview ? (point) => onDragPreview(asset, point) : undefined
							}
							onDrop={(point) => {
								onChoose(asset, point);
								onClose();
							}}
							onClick={() => {
								onChoose(asset);
								onClose();
							}}
						/>
						<div className="meme-card-actions">
							<button
								disabled={busy}
								aria-label={`${asset.loved ? "Unlove" : "Love"} ${asset.name}`}
								aria-pressed={!!asset.loved}
								title="Love ♥ — keep this meme near the top across all projects and recordings until you unlove it."
								onClick={() => void preference(asset.id, "love", !asset.loved)}
							>
								<HeartIcon size={17} weight={asset.loved ? "fill" : "regular"} />
							</button>
							<button
								disabled={busy}
								aria-label={`${state.favoriteMemeIds?.includes(asset.id) ? "Unfavorite" : "Favorite"} ${asset.name}`}
								aria-pressed={!!state.favoriteMemeIds?.includes(asset.id)}
								title="Favorite ★ — pin this meme for this recording or saved environment only. Favorites reset after the take; Love keeps it across projects."
								onClick={() =>
									void preference(
										asset.id,
										"favorite",
										!state.favoriteMemeIds?.includes(asset.id),
									)
								}
							>
								<StarIcon
									size={17}
									weight={
										state.favoriteMemeIds?.includes(asset.id)
											? "fill"
											: "regular"
									}
								/>
							</button>
							<button
								aria-label={`Settings for ${asset.name}`}
								onClick={() => {
									setTagDraft(asset.tags?.join(", ") ?? "");
									setEdit(asset);
								}}
							>
								<GearSixIcon size={17} />
							</button>
						</div>
					</div>
				))}
			</div>
			<button
				disabled={busy}
				onClick={async () => {
					setBusy(true);
					setError("");
					try {
						await transport.request("restoreDefaultMemes");
					} catch (e) {
						setError(String(e));
					} finally {
						setBusy(false);
					}
				}}
			>
				Restore default memes
			</button>
			{edit && (
				<form
					className="meme-options"
					onSubmit={(e) => {
						e.preventDefault();
						void save({
							...edit,
							tags: tagDraft
								.split(",")
								.map((tag) => tag.trim())
								.filter(Boolean),
						});
					}}
				>
					<input
						aria-label="Meme name"
						value={edit.name}
						required
						maxLength={80}
						onChange={(e) => setEdit({ ...edit, name: e.target.value })}
					/>
					<label>
						AI suggestion hint
						<input
							value={edit.description ?? ""}
							maxLength={300}
							placeholder="When would you use this reaction?"
							onChange={(e) => setEdit({ ...edit, description: e.target.value })}
						/>
					</label>
					<label>
						Search tags
						<textarea
							value={tagDraft}
							maxLength={1200}
							rows={2}
							placeholder="stupid, really, disbelief…"
							onChange={(e) => setTagDraft(e.target.value)}
						/>
						<small>
							Separate tags with commas. Used by search and the AI mic (up to 30).
						</small>
					</label>
					{(["enter", "exit"] as const).map((key) => (
						<label key={key}>
							{key === "enter" ? "Transition in" : "Transition out"}
							<select
								value={edit[key]}
								onChange={(e) =>
									setEdit({ ...edit, [key]: e.target.value as MemeTransition })
								}
							>
								{transitions.map((t) => (
									<option key={t} value={t}>
										{t === "none"
											? "None"
											: `${t[0].toUpperCase()}${t.slice(1)} ${key === "enter" ? "in" : "out"}`}
									</option>
								))}
							</select>
						</label>
					))}
					<label>
						<input
							type="checkbox"
							checked={edit.stayUntilClicked}
							onChange={(e) =>
								setEdit({ ...edit, stayUntilClicked: e.target.checked })
							}
						/>
						Stay until clicked or cleared
					</label>
					{!edit.stayUntilClicked && (
						<label>
							Seconds on screen
							<input
								type="number"
								min={1}
								max={120}
								value={edit.durationSeconds}
								onChange={(e) =>
									setEdit({ ...edit, durationSeconds: Number(e.target.value) })
								}
							/>
						</label>
					)}
					<label>
						Sound on placement
						<select
							value={edit.soundId}
							onChange={(e) => setEdit({ ...edit, soundId: e.target.value })}
						>
							<option value="">No sound</option>
							{sounds.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name}
								</option>
							))}
						</select>
					</label>
					<label className="board-import">
						＋ Upload sound
						<input
							type="file"
							accept="audio/*"
							disabled={busy}
							onChange={async (e) => {
								const file = e.target.files?.[0];
								e.target.value = "";
								if (!file) return;
								if (file.size > 12 * 1024 * 1024) {
									setError("Choose an audio clip under 12 MB.");
									return;
								}
								setBusy(true);
								setError("");
								try {
									const dataURL = await new Promise<string>((resolve, reject) => {
										const reader = new FileReader();
										reader.onload = () => resolve(String(reader.result));
										reader.onerror = reject;
										reader.readAsDataURL(file);
									});
									const sound = await transport.request<SoundEffect>(
										"uploadMemeSound",
										{ name: file.name, dataURL },
									);
									setSounds((old) => [...old, sound]);
									setEdit((old) => (old ? { ...old, soundId: sound.id } : old));
								} catch (error) {
									setError(String(error));
								} finally {
									setBusy(false);
								}
							}}
						/>
					</label>
					<small>Sound follows your soundboard recording setting.</small>
					<label>
						Shake on deployment
						<select
							value={edit.shake?.target ?? "none"}
							onChange={(e) =>
								setEdit({
									...edit,
									shake:
										e.target.value === "none"
											? undefined
											: {
													target: e.target.value as "meme" | "screen",
													strength: edit.shake?.strength ?? 8,
													durationMs: edit.shake?.durationMs ?? 600,
												},
								})
							}
						>
							<option value="none">None</option>
							<option value="meme">Meme only</option>
							<option value="screen">Recording + preview</option>
						</select>
					</label>
					{edit.shake && (
						<>
							<label>
								Shake strength · {edit.shake.strength}
								<input
									aria-label="Shake strength"
									type="range"
									min="1"
									max="24"
									value={edit.shake.strength}
									onChange={(e) =>
										setEdit({
											...edit,
											shake: {
												...edit.shake!,
												strength: Number(e.target.value),
											},
										})
									}
								/>
							</label>
							<label>
								Shake duration · {(edit.shake.durationMs / 1000).toFixed(1)}s
								<input
									aria-label="Shake duration"
									type="range"
									min="100"
									max="2000"
									step="100"
									value={edit.shake.durationMs}
									onChange={(e) =>
										setEdit({
											...edit,
											shake: {
												...edit.shake!,
												durationMs: Number(e.target.value),
											},
										})
									}
								/>
							</label>
							<small>
								Brief movement in the picture. Presenter controls stay still. Screen
								shake is included in Mac recordings and the live preview.
							</small>
						</>
					)}
					<small>
						Save keeps these sound, timing and effect settings across projects.
					</small>

					<label>
						<input
							type="checkbox"
							checked={!!edit.shadow}
							onChange={(e) => setEdit({ ...edit, shadow: e.target.checked })}
						/>
						Shadow object · iPad only
					</label>
					<small>
						{SHADOW_HELP} Sound and the entrance transition start only when shown.
					</small>
					<footer>
						<button type="submit" disabled={busy}>
							Save
						</button>
						<button type="button" onClick={() => setEdit(undefined)}>
							Cancel
						</button>
						<button
							type="button"
							onClick={() =>
								void transport
									.request("deleteMeme", edit.id)
									.then(() => setEdit(undefined))
									.catch((e) => setError(String(e)))
							}
						>
							Remove
						</button>
					</footer>
				</form>
			)}
			<output role="status">{error}</output>
		</aside>
	);
}
function MemeImage({
	item,
	asset,
	clean,
	onRemove,
	onShadow,
	interactive,
	zoom,
	transport,
}: {
	item: PlacedMeme;
	asset: MemeAsset;
	clean: boolean;
	interactive: boolean;
	zoom: number;
	transport: BoardAPI;
	onRemove: () => void;
	onShadow?: (shadow: boolean) => Promise<void>;
}) {
	const [options, setOptions] = useState(false);
	const [menu, setMenu] = useState<{ x: number; y: number }>();
	const [position, setPosition] = useState<ObjectRect>(item);
	const [keep, setKeep] = useState(item.stayUntilClicked);
	const gesture = useRef<{
		id: number;
		x: number;
		y: number;
		rect: ObjectRect;
		moved: boolean;
		held: boolean;
		sent: number;
		timer?: ReturnType<typeof setTimeout>;
	}>();
	const suppress = useRef(false);
	const latest = useRef(position);
	latest.current = position;
	useEffect(() => {
		setPosition(item);
		setKeep(item.stayUntilClicked);
	}, [item.x, item.y, item.width, item.height, item.stayUntilClicked]);
	useEffect(
		() =>
			transport.on<{
				id: string;
				x: number;
				y: number;
				width: number;
				height: number;
				stayUntilClicked: boolean;
			}>("memeTransform", (patch) => {
				if (patch.id === item.id && !gesture.current?.moved) {
					setPosition(patch);
					setKeep(patch.stayUntilClicked);
				}
			}),
		[item.id, transport],
	);
	const request = (method: string, input: unknown) =>
		transport.request(method, input).catch((e) => setError(String(e)));
	const openMenu = (x: number, y: number) => {
		if (clean && !onShadow) void request("memeContextMenu", item.id);
		else
			setMenu({
				x: Math.max(8, Math.min(window.innerWidth - 216, x)),
				y: Math.max(8, Math.min(window.innerHeight - 260, y)),
			});
	};
	const end = (cancelled = false) => {
		const g = gesture.current;
		gesture.current = undefined;
		clearTimeout(g?.timer);
		if (!g) return;
		suppress.current = true;
		if (g.moved)
			void request("updateMeme", { id: item.id, ...latest.current, keep: true, final: true });
		else if (!g.held && !cancelled) {
			if (item.shadow) setOptions((v) => !v);
			else onRemove();
		}
		if (clean && !onShadow) void request("memeInteraction", { id: item.id, active: false });
	};
	useEffect(
		() => () => {
			clearTimeout(gesture.current?.timer);
		},
		[],
	);

	const [error, setError] = useState("");
	const [now, setNow] = useState(Date.now());
	const exitTime = Math.min(
		item.removedAt ?? Infinity,
		item.shadow || keep ? Infinity : item.placedAt + item.durationSeconds * 1000,
	);
	useEffect(() => {
		if (!Number.isFinite(exitTime)) return;
		const timer = setTimeout(() => setNow(Date.now()), Math.max(0, exitTime - Date.now()));
		const gone = setTimeout(() => setNow(Date.now()), Math.max(0, exitTime + 450 - Date.now()));
		return () => {
			clearTimeout(timer);
			clearTimeout(gone);
		};
	}, [exitTime]);
	const current = Math.max(now, Date.now());
	const leaving = current >= exitTime;
	if (leaving && (item.exit === "none" || current >= exitTime + 450)) return null;
	const transition = item.shadow ? "none" : leaving ? item.exit : item.enter;
	const elapsed = Math.max(0, current - (leaving ? exitTime : item.placedAt));
	return (
		<div
			className="placed-meme"
			style={{
				left: position.x,
				top: position.y,
				width: position.width,
				height: position.height,
				pointerEvents: interactive ? "auto" : "none",
			}}
		>
			<button
				tabIndex={clean ? -1 : 0}
				disabled={!interactive}
				aria-label={`${item.shadow ? "Shadow options for" : "Dismiss"} ${asset.name}`}
				title={
					clean && !onShadow
						? undefined
						: "Drag to move and keep on screen. Tap to dismiss. Right-click or hold for options."
				}
				onPointerDown={(e) => {
					if (e.button !== 0) return;
					e.preventDefault();
					e.stopPropagation();
					suppress.current = false;
					const g = {
						id: e.pointerId,
						x: e.clientX,
						y: e.clientY,
						rect: { ...position },
						moved: false,
						held: false,
						sent: 0,
						timer: undefined as ReturnType<typeof setTimeout> | undefined,
					};
					gesture.current = g;
					e.currentTarget.setPointerCapture(e.pointerId);
					if (clean && !onShadow)
						void request("memeInteraction", { id: item.id, active: true });
					if (e.pointerType !== "mouse")
						g.timer = setTimeout(() => {
							g.held = true;
							openMenu(g.x, g.y);
						}, 500);
				}}
				onPointerMove={(e) => {
					const g = gesture.current;
					if (!g || g.id !== e.pointerId || g.held) return;
					const dx = e.clientX - g.x,
						dy = e.clientY - g.y;
					if (Math.hypot(dx, dy) > 6) {
						g.moved = true;
						clearTimeout(g.timer);
					}
					if (!g.moved) return;
					e.preventDefault();
					e.stopPropagation();
					setKeep(true);
					const next = dragObject(g.rect, dx, dy, zoom);
					latest.current = next;
					setPosition(next);
					if (Date.now() - g.sent > 40) {
						g.sent = Date.now();
						void request("updateMeme", { id: item.id, ...next, keep: true });
					}
				}}
				onPointerUp={(e) => {
					e.stopPropagation();
					end();
				}}
				onPointerCancel={() => end(true)}
				onLostPointerCapture={() => end(true)}
				onContextMenu={(e) => {
					e.preventDefault();
					e.stopPropagation();
					end(true);
					openMenu(e.clientX, e.clientY);
				}}
				onClick={(e) => {
					e.stopPropagation();
					if (e.detail === 0 && !suppress.current) {
						if (item.shadow) setOptions(!options);
						else onRemove();
					}
					suppress.current = false;
				}}
				style={{
					opacity: item.shadow ? 0.5 : 1,
					animation:
						transition === "none"
							? undefined
							: `meme-${transition}-${leaving ? "out" : "in"} 450ms both`,
					animationDelay: `-${Math.min(450, elapsed)}ms`,
				}}
			>
				<img
					src={asset.dataURL}
					alt={asset.name}
					draggable={false}
					key={item.shakeAt ?? 0}
					style={
						item.shake?.target === "meme" && item.shakeAt
							? ({
									animation: `meme-jolt ${item.shake.durationMs}ms linear both`,
									animationDelay: `-${Math.min(item.shake.durationMs, Math.max(0, Date.now() - item.shakeAt))}ms`,
									"--shake-distance": `${item.shake.strength}px`,
								} as React.CSSProperties)
							: undefined
					}
				/>
			</button>
			{menu &&
				createPortal(
					<div
						className="meme-live-menu"
						role="menu"
						style={{ left: menu.x, top: menu.y }}
						onPointerDown={(e) => e.stopPropagation()}
					>
						<strong>{asset.name}</strong>
						<button
							onClick={() => {
								setKeep(true);
								void request("updateMeme", {
									id: item.id,
									keep: true,
									final: true,
								});
								setMenu(undefined);
							}}
						>
							Keep on screen
						</button>
						<button
							onClick={() => {
								onRemove();
								setMenu(undefined);
							}}
						>
							Remove from screen
						</button>
						<button
							onClick={() => {
								void request("shakeMeme", { id: item.id, target: "meme" });
								setMenu(undefined);
							}}
						>
							Shake meme
						</button>
						<button
							onClick={() => {
								void request("shakeMeme", { id: item.id, target: "screen" });
								setMenu(undefined);
							}}
						>
							Shake screen
						</button>
						<button onClick={() => setMenu(undefined)}>Close</button>
						{error && <small role="alert">{error}</small>}
					</div>,
					document.body,
				)}

			{onShadow && (
				<>
					<button
						className="meme-shadow-gear"
						aria-label={`Visibility for ${asset.name}`}
						onClick={() => setOptions(!options)}
					>
						⚙
					</button>
					{options && (
						<div className="meme-shadow-options">
							<small>
								{item.shadow ? "Shadow · iPad only" : "Visible on screen"}
							</small>
							<button
								onClick={() =>
									void onShadow(!item.shadow)
										.then(() => setOptions(false))
										.catch((e) => setError(String(e)))
								}
							>
								{item.shadow ? "Show on screen" : "Make shadow"}
							</button>
							<button onClick={onRemove}>Remove</button>
							{error && <output>{error}</output>}
						</div>
					)}
				</>
			)}
		</div>
	);
}
export function MemeLayer({
	state,
	mode,
	view,
	clean,
	tablet = false,
	interactive = !clean,
	transport,
}: {
	state: BoardState;
	mode: "screen" | "board";
	view: { x: number; y: number; zoom: number };
	clean: boolean;
	transport: BoardAPI;
	tablet?: boolean;
	interactive?: boolean;
}) {
	return (
		<div
			className="meme-layer"
			style={{ transform: `scale(${view.zoom}) translate(${view.x}px, ${view.y}px)` }}
		>
			{state.placedMemes?.[mode].map((item) => {
				const asset = state.memes?.find((m) => m.id === item.assetId);
				return asset && (tablet || !item.shadow) ? (
					<MemeImage
						key={`${item.id}:${item.placedAt}:${item.shadow}`}
						item={item}
						asset={asset}
						clean={clean}
						interactive={interactive}
						zoom={view.zoom}
						transport={transport}
						onRemove={() => void transport.request("removeMeme", item.id)}
						onShadow={
							tablet
								? async (shadow) => {
										await transport.request("setMemeShadow", {
											id: item.id,
											mode,
											shadow,
										});
									}
								: undefined
						}
					/>
				) : null;
			})}
		</div>
	);
}
