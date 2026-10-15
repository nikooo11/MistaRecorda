import { useEffect, useState } from "react";
import type { BoardAPI, BoardState } from "../../types/board";
import type { MemeAsset, MemeTransition, PlacedMeme } from "../../types/memes";
import type { SoundEffect } from "../../types/studio";

const transitions: MemeTransition[] = ["none", "fade", "spin", "fall"];
export function MemeLibrary({
	transport,
	state,
	onChoose,
	onClose,
}: {
	transport: BoardAPI;
	state: BoardState;
	onChoose: (asset: MemeAsset) => void;
	onClose: () => void;
}) {
	const [edit, setEdit] = useState<MemeAsset>();
	const [sounds, setSounds] = useState<SoundEffect[]>([]);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
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
			<p>
				Choose a meme, move the 50% preview, then tap to place it. Nothing appears in the
				recording until placed.
			</p>
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
								id: crypto.randomUUID(),
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
			<div className="meme-grid">
				{state.memes?.map((asset) => (
					<div key={asset.id}>
						<button
							onClick={() => {
								onChoose(asset);
								onClose();
							}}
							title={`Place ${asset.name}`}
						>
							<img src={asset.dataURL} alt="" />
							<span>{asset.name}</span>
						</button>
						<button
							aria-label={`Settings for ${asset.name}`}
							onClick={() => setEdit(asset)}
						>
							⚙
						</button>
					</div>
				))}
			</div>
			{edit && (
				<form
					className="meme-options"
					onSubmit={(e) => {
						e.preventDefault();
						void save(edit);
					}}
				>
					<input
						aria-label="Meme name"
						value={edit.name}
						required
						maxLength={80}
						onChange={(e) => setEdit({ ...edit, name: e.target.value })}
					/>
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
}: {
	item: PlacedMeme;
	asset: MemeAsset;
	clean: boolean;
	onRemove: () => void;
}) {
	const [now, setNow] = useState(Date.now());
	const exitTime =
		item.removedAt ??
		(item.stayUntilClicked ? Infinity : item.placedAt + item.durationSeconds * 1000);
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
	const transition = leaving ? item.exit : item.enter;
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
				aria-label={`Dismiss ${asset.name}`}
				onClick={(e) => {
					e.stopPropagation();
					onRemove();
				}}
				style={{
					animation:
						transition === "none"
							? undefined
							: `meme-${transition}-${leaving ? "out" : "in"} 450ms both`,
					animationDelay: `-${Math.min(450, elapsed)}ms`,
				}}
			>
				<img src={asset.dataURL} alt={asset.name} draggable={false} />
			</button>
		</div>
	);
}
export function MemeLayer({
	state,
	mode,
	view,
	clean,
	transport,
}: {
	state: BoardState;
	mode: "screen" | "board";
	view: { x: number; y: number; zoom: number };
	clean: boolean;
	transport: BoardAPI;
}) {
	return (
		<div
			className="meme-layer"
			style={{ transform: `scale(${view.zoom}) translate(${view.x}px, ${view.y}px)` }}
		>
			{state.placedMemes?.[mode].map((item) => {
				const asset = state.memes?.find((m) => m.id === item.assetId);
				return asset ? (
					<MemeImage
						key={item.id}
						item={item}
						asset={asset}
						clean={clean}
						onRemove={() => void transport.request("removeMeme", item.id)}
					/>
				) : null;
			})}
		</div>
	);
}
