import { SHADOW_HELP } from "./shadowObjects";
import { presenterId } from "./presenterModel";
import { useEffect, useState } from "react";
import { HeartIcon, StarIcon, GearSixIcon } from "@phosphor-icons/react";
import { matchingMemes } from "./memePreferences";
import { MemePreviewButton } from "./MemePreviewButton";
import type { BoardAPI, BoardState } from "../../types/board";
import type { MemeAsset, MemeTransition, PlacedMeme } from "../../types/memes";
import type { SoundEffect } from "../../types/studio";

const transitions: MemeTransition[] = ["none", "fade", "spin", "fall"];
export function MemeLibrary({
	transport,
	state,
	onChoose,
	onClose,
	initialEditId,
}: {
	transport: BoardAPI;
	state: BoardState;
	onChoose: (asset: MemeAsset) => void;
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
					Choose a meme, move the 50% preview, then tap to place it. Nothing appears in
					the recording until placed.
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
								enter: "none",
								exit: "none",
								stayUntilClicked: true,
								durationSeconds: 5,
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
								title="Love · keep at the top across projects"
								onClick={() => void preference(asset.id, "love", !asset.loved)}
							>
								<HeartIcon size={17} weight={asset.loved ? "fill" : "regular"} />
							</button>
							<button
								disabled={busy}
								aria-label={`${state.favoriteMemeIds?.includes(asset.id) ? "Unfavorite" : "Favorite"} ${asset.name}`}
								aria-pressed={!!state.favoriteMemeIds?.includes(asset.id)}
								title="Favorite · this take or saved environment only"
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
					<small>Sound follows your soundboard recording setting.</small>
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
}: {
	item: PlacedMeme;
	asset: MemeAsset;
	clean: boolean;
	onRemove: () => void;
	onShadow?: (shadow: boolean) => Promise<void>;
}) {
	const [options, setOptions] = useState(false);
	const [error, setError] = useState("");
	const [now, setNow] = useState(Date.now());
	const exitTime =
		item.removedAt ??
		(item.shadow || item.stayUntilClicked
			? Infinity
			: item.placedAt + item.durationSeconds * 1000);
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
				left: item.x,
				top: item.y,
				width: item.width,
				height: item.height,
				pointerEvents: clean ? "none" : "auto",
			}}
		>
			<button
				tabIndex={clean ? -1 : 0}
				disabled={clean}
				aria-label={`${item.shadow ? "Shadow options for" : "Dismiss"} ${asset.name}`}
				onClick={(e) => {
					e.stopPropagation();
					if (item.shadow) setOptions(!options);
					else onRemove();
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
				<img src={asset.dataURL} alt={asset.name} draggable={false} />
			</button>
			{!clean && onShadow && (
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
	transport,
}: {
	state: BoardState;
	mode: "screen" | "board";
	view: { x: number; y: number; zoom: number };
	clean: boolean;
	transport: BoardAPI;
	tablet?: boolean;
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
