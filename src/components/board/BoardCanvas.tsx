import { useCallback, useEffect, useRef, useState } from "react";
import {
	Excalidraw,
	restoreElements,
	convertToExcalidrawElements,
	CaptureUpdateAction,
} from "@excalidraw/excalidraw";
import type {
	ExcalidrawImperativeAPI,
	BinaryFiles,
	AppState,
	LibraryItems,
	BinaryFileData,
} from "@excalidraw/excalidraw/types";
import type { BoardAPI, BoardState, BoardElement, BoardScene } from "../../types/board";
import "@excalidraw/excalidraw/index.css";
import "./board.css";
(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw/";
export function BoardCanvas({
	transport,
	initial,
	clean = false,
	tablet = false,
	background,
	streamed = false,
}: {
	transport: BoardAPI;
	initial: BoardState;
	clean?: boolean;
	tablet?: boolean;
	background?: React.ReactNode;
	streamed?: boolean;
}) {
	const stage = useRef<HTMLDivElement>(null);
	const [fit, setFit] = useState({ scale: 1, left: 0, top: 0 });
	const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
	const [state, setState] = useState(initial);
	const [error, setError] = useState("");
	const [assets, setAssets] = useState(false);
	const current = useRef(initial);
	const applying = useRef(false);
	const interacted = useRef(false);
	const pending = useRef<{ mode: "screen" | "board"; scene: BoardScene } | null>(null);
	const saving = useRef(false);
	const inFlight = useRef<Promise<void>>();
	const timer = useRef<ReturnType<typeof setTimeout>>();
	const last = useRef("");
	const modeRef = useRef(initial.mode);
	useEffect(() => {
		if (!tablet || !stage.current) return;
		const observer = new ResizeObserver(() => {
			const r = stage.current!.getBoundingClientRect();
			const scale = Math.min(r.width / state.width, r.height / state.height);
			setFit({
				scale,
				left: (r.width - state.width * scale) / 2,
				top: (r.height - state.height * scale) / 2,
			});
		});
		observer.observe(stage.current);
		return () => observer.disconnect();
	}, [tablet, state.width, state.height]);
	const cleanMode = clean && state.output === "board" ? "board" : state.mode;
	async function flush(): Promise<void> {
		if (inFlight.current) {
			await inFlight.current;
			if (pending.current) await flush();
			return;
		}
		if (!pending.current) return;
		const edit = pending.current;
		pending.current = null;
		saving.current = true;
		inFlight.current = (async () => {
			try {
				const next = await transport.request<BoardState>("scene", {
					...edit,
					revision: current.current.revision,
				});
				if (next.revision >= current.current.revision) {
					current.current = next;
					setState(next);
				}
				setError("");
			} catch (e) {
				setError(
					`${e instanceof Error ? e.message : "Save failed"} Your pending edit was not saved. Refresh before continuing.`,
				);
			} finally {
				saving.current = false;
				inFlight.current = undefined;
			}
		})();
		await inFlight.current;
		if (pending.current) await flush();
	}

	const apply = useCallback(
		(next: BoardState, origin?: string) => {
			if (!clean && (saving.current || pending.current) && next.mode === modeRef.current)
				return;
			current.current = next;
			setState(next);
			if (!api) return;
			if (clean)
				requestAnimationFrame(() => {
					document.documentElement.dataset.boardRevision = String(next.revision);
				});
			const mode = clean && next.output === "board" ? "board" : next.mode;
			const scene = next.scenes[mode];
			const signature = JSON.stringify(scene);
			if (
				signature === last.current &&
				mode === modeRef.current &&
				Math.abs(api.getAppState().zoom.value - scene.zoom * fit.scale) < 0.0001
			)
				return;
			if (!clean && (saving.current || pending.current) && mode === modeRef.current) return;
			applying.current = true;
			interacted.current = false;
			modeRef.current = mode;
			last.current = signature;
			api.addFiles(Object.values(scene.files) as BinaryFileData[]);
			api.updateScene({
				captureUpdate:
					origin === "codex"
						? CaptureUpdateAction.IMMEDIATELY
						: CaptureUpdateAction.NEVER,
				elements: restoreElements(
					scene.elements as unknown as Parameters<typeof restoreElements>[0],
					null,
				),
				appState: {
					scrollX: scene.scrollX,
					scrollY: scene.scrollY,
					zoom: { value: (scene.zoom * fit.scale) as AppState["zoom"]["value"] },
					viewBackgroundColor: mode === "board" ? "#ffffff" : "transparent",
				},
			});

			requestAnimationFrame(() => {
				applying.current = false;
			});
		},
		[api, clean, fit.scale],
	);
	useEffect(() => {
		if (api) apply(current.current);
		return transport.on<{ state: BoardState; origin: string }>(
			"state",
			({ state: next, origin }) => apply(next, origin),
		);
	}, [api, apply, transport]);
	useEffect(() => transport.on<string>("error", setError), [transport]);
	useEffect(() => {
		if (api) void api.updateLibrary({ libraryItems: state.library as LibraryItems });
	}, [api, state.library]);
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);
	async function chooseMode() {
		await flush();
		const next = await transport.request<BoardState>("mode", {
			mode: current.current.mode === "board" ? "screen" : "board",
		});
		apply(next);
	}
	async function addImage(file: File) {
		if (!api) return;
		if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
			throw Error("Choose PNG, JPEG or WebP");
		if (file.size > 12 * 1024 * 1024) throw Error("Image must be smaller than 12 MB");
		const dataURL = await new Promise<string>((r, j) => {
			const f = new FileReader();
			f.onload = () => r(String(f.result));
			f.onerror = j;
			f.readAsDataURL(file);
		});
		const image = new Image();
		image.src = dataURL;
		await image.decode();
		const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) =>
			v.toString(16).padStart(2, "0"),
		).join("");
		api.addFiles([
			{ id, dataURL, mimeType: file.type, created: Date.now() },
		] as BinaryFileData[]);
		placeImage(id, image.width, image.height);
	}
	function placeImage(fileId: string, width = 320, height = 240) {
		if (!api) return;
		interacted.current = true;
		const view = api.getAppState();
		const w = Math.min(width, 600);
		const element = convertToExcalidrawElements([
			{
				type: "image",
				fileId,
				x: -view.scrollX + 120 / view.zoom.value,
				y: -view.scrollY + 120 / view.zoom.value,
				width: w,
				height: (w * height) / width,
			},
		] as Parameters<typeof convertToExcalidrawElements>[0]);
		api.updateScene({
			elements: [...api.getSceneElements(), ...element],
			captureUpdate: CaptureUpdateAction.IMMEDIATELY,
		});
	}
	return (
		<div
			ref={stage}
			onPointerDownCapture={() => {
				interacted.current = true;
			}}
			onWheelCapture={() => {
				interacted.current = true;
			}}
			onKeyDownCapture={() => {
				interacted.current = true;
			}}
			className={`board-stage ${clean ? "board-clean" : ""} ${tablet ? "board-tablet" : ""}`}
		>
			{background && <div className="board-video">{background}</div>}
			<div
				className={`board-paper ${cleanMode === "board" ? "board-deployed" : ""} ${tablet && streamed && cleanMode === "screen" ? "board-streamed-ink" : ""}`}
				style={{
					width: state.width * fit.scale,
					height: state.height * fit.scale,
					left: fit.left,
					top: fit.top,
					visibility: clean && state.output === "screen" ? "hidden" : "visible",
				}}
			>
				<Excalidraw
					excalidrawAPI={setApi}
					viewModeEnabled={clean}
					zenModeEnabled={clean}
					initialData={{
						elements: restoreElements(
							initial.scenes[cleanMode].elements as unknown as Parameters<
								typeof restoreElements
							>[0],
							null,
						),
						files: initial.scenes[cleanMode].files as BinaryFiles,
						libraryItems: initial.library as LibraryItems,
						appState: {
							viewBackgroundColor: cleanMode === "board" ? "#fff" : "transparent",
							scrollX: initial.scenes[cleanMode].scrollX,
							scrollY: initial.scenes[cleanMode].scrollY,
							zoom: {
								value: initial.scenes[cleanMode].zoom as AppState["zoom"]["value"],
							},
						},
					}}
					onChange={(elements, view, files) => {
						if (clean || applying.current || !interacted.current || !api) return;
						const scene: BoardScene = {
							elements: elements as unknown as BoardElement[],
							files: files as BoardScene["files"],
							scrollX: view.scrollX,
							scrollY: view.scrollY,
							zoom: Math.max(0.1, Math.min(10, view.zoom.value / fit.scale)),
						};
						const signature = JSON.stringify(scene);
						if (signature === last.current) return;
						last.current = signature;
						pending.current = { mode: modeRef.current, scene };
						if (!timer.current)
							timer.current = setTimeout(() => {
								timer.current = undefined;
								void flush();
							}, 40);
					}}
					onLibraryChange={(library) => {
						if (
							!clean &&
							JSON.stringify(library) !== JSON.stringify(current.current.library)
						)
							void transport
								.request("library", library)
								.catch((e) => setError(String(e)));
					}}
					UIOptions={{
						canvasActions: {
							loadScene: false,
							saveToActiveFile: false,
							export: false,
							saveAsImage: false,
							toggleTheme: false,
						},
					}}
				/>
			</div>
			{!clean && (
				<div className="board-actions">
					<button onClick={() => void chooseMode().catch((e) => setError(String(e)))}>
						{state.mode === "board" ? "Return to screen" : "Open whiteboard"}
					</button>
					<button onClick={() => setAssets(!assets)}>Standby images</button>
					<label className="board-import">
						Import image
						<input
							type="file"
							accept="image/png,image/jpeg,image/webp"
							onChange={(e) => {
								const f = e.target.files?.[0];
								if (f) void addImage(f).catch((e) => setError(String(e)));
								e.target.value = "";
							}}
						/>
					</label>
					<button
						onClick={() => {
							if (confirm("Clear this drawing scene? Saved scenes are kept."))
								void transport
									.request<BoardState>("clear", { confirmed: true })
									.then((next) => apply(next))
									.catch((e) => setError(String(e)));
						}}
					>
						Clear scene
					</button>
					{!tablet && (
						<button
							onClick={() => void flush().then(() => transport.request("hideEditor"))}
						>
							Done drawing
						</button>
					)}
				</div>
			)}
			{!clean && assets && (
				<aside className="board-assets">
					<p>
						Tap an image to place another copy. Use Excalidraw’s Library for reusable
						shapes and grouped drawings.
					</p>
					{Object.values(state.scenes[state.mode].files).map((f) => (
						<button
							key={f.id}
							title="Place image"
							onClick={() => {
								const image = new Image();
								image.onload = () => placeImage(f.id, image.width, image.height);
								image.src = f.dataURL;
							}}
						>
							<img src={f.dataURL} alt="Saved drawing asset" />
						</button>
					))}
				</aside>
			)}
			{!clean && error && (
				<div role="alert" className="board-error">
					{error}
					<button
						onClick={() =>
							void transport
								.request<{ state: BoardState }>(tablet ? "tabletInfo" : "info")
								.then((data) => {
									pending.current = null;
									apply(data.state);
									setError("");
								})
						}
					>
						Refresh board
					</button>
				</div>
			)}
		</div>
	);
}
