import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
	Excalidraw,
	restoreElements,
	convertToExcalidrawElements,
	CaptureUpdateAction,
	FONT_FAMILY,
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
import {
	fittedTabletView,
	readTabletView,
	tabletSceneMode,
	tabletViewport,
	withoutTextDraft,
} from "./tabletInteraction";
(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = "/excalidraw/";
export function BoardCanvas({
	transport,
	initial,
	clean = false,
	tablet = false,
	background,
	streamed = false,
	drawing = true,
}: {
	transport: BoardAPI;
	initial: BoardState;
	clean?: boolean;
	tablet?: boolean;
	background?: React.ReactNode;
	streamed?: boolean;
	drawing?: boolean;
}) {
	const stage = useRef<HTMLDivElement>(null);
	const [fit, setFit] = useState({ scale: 1, left: 0, top: 0 });
	const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
	const [state, setState] = useState(initial);
	const [error, setError] = useState("");
	const [assets, setAssets] = useState(false);
	const [boardClosing, setBoardClosing] = useState(false);
	const [tabletView, setTabletView] = useState(fittedTabletView);
	const localView = useRef(fittedTabletView());
	const textInput = useRef<HTMLTextAreaElement>(null);
	const [draft, setDraft] = useState<{
		mode: "screen" | "board";
		x: number;
		y: number;
		text: string;
		fontSize: number;
		fontFamily: number;
		strokeColor: string;
		id?: string;
	} | null>(null);
	const draftRef = useRef(draft);
	const committing = useRef(false);
	const [publishingText, setPublishingText] = useState(false);
	draftRef.current = draft;
	const closing = useRef(false);
	const closeTimer = useRef<ReturnType<typeof setTimeout>>();
	const current = useRef(initial);
	const applying = useRef(false);
	const interacted = useRef(false);
	const pending = useRef<{ mode: "screen" | "board"; scene: BoardScene } | null>(null);
	const saving = useRef(false);
	const inFlight = useRef<Promise<void>>();
	const timer = useRef<ReturnType<typeof setTimeout>>();
	const last = useRef("");
	const modeRef = useRef(tablet ? tabletSceneMode(initial) : initial.mode);
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
	const cleanMode = tablet
		? tabletSceneMode(state)
		: clean && state.output === "board"
			? "board"
			: state.mode;
	const showMaterial = (cleanMode === "board" || boardClosing) && !(tablet && streamed);

	useEffect(() => () => clearTimeout(closeTimer.current), []);
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
		(next: BoardState, origin?: string, finishClose = false): void => {
			if (next.revision < current.current.revision) return;
			current.current = next;
			setState(next);
			if (!api) return;
			if (clean)
				requestAnimationFrame(() => {
					document.documentElement.dataset.boardRevision = String(next.revision);
				});
			const mode = tablet
				? tabletSceneMode(next)
				: clean && next.output === "board"
					? "board"
					: next.mode;
			if (tablet && mode !== modeRef.current) {
				pending.current = null;
				localView.current = fittedTabletView();
				setTabletView(localView.current);
				setDraft(null);
			}
			if (mode === "board") {
				clearTimeout(closeTimer.current);
				closing.current = false;
				setBoardClosing(false);
			} else if (!tablet && modeRef.current === "board" && !finishClose) {
				if (!closing.current) {
					closing.current = true;
					applying.current = true;
					setBoardClosing(true);
					closeTimer.current = setTimeout(() => {
						closing.current = false;
						setBoardClosing(false);
						apply(current.current, origin, true);
					}, 440);
				}
				return;
			}
			const scene = next.scenes[mode];
			const viewport = tabletViewport(
				scene,
				fit.scale,
				tablet ? localView.current : fittedTabletView(),
			);
			const signature = JSON.stringify(scene);
			if (
				signature === last.current &&
				mode === modeRef.current &&
				Math.abs(api.getAppState().zoom.value - viewport.zoom) < 0.0001
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
					scrollX: viewport.scrollX,
					scrollY: viewport.scrollY,
					zoom: { value: viewport.zoom as AppState["zoom"]["value"] },
					viewBackgroundColor: "transparent",
				},
			});

			requestAnimationFrame(() => {
				applying.current = false;
			});
		},
		[api, clean, fit.scale, tablet],
	);
	useEffect(() => {
		if (tablet) apply(initial);
	}, [initial, tablet, apply]);
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
			mode: modeRef.current === "board" ? "screen" : "board",
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
	function openTextDraft(x: number, y: number) {
		if (!api) return;
		const view = api.getAppState();
		flushSync(() =>
			setDraft({
				mode: modeRef.current,
				x,
				y,
				text: "",
				fontSize: view.currentItemFontSize,
				fontFamily: view.currentItemFontFamily,
				strokeColor: view.currentItemStrokeColor,
			}),
		);
		textInput.current?.focus();
	}
	async function commitText() {
		if (!api || !draft || !draft.text.trim() || committing.current) return;
		committing.current = true;
		setPublishingText(true);
		try {
			await flush();
			const family =
				Object.entries(FONT_FAMILY).find(([, value]) => value === draft.fontFamily)?.[0] ??
				"Helvetica";
			await document.fonts.load(`${draft.fontSize}px "${family}"`);
			if (draft.mode !== modeRef.current) {
				setDraft(null);
				return;
			}
			const elements = convertToExcalidrawElements([
				{
					type: "text",
					x: draft.x,
					y: draft.y,
					text: draft.text,
					fontSize: draft.fontSize,
					fontFamily: draft.fontFamily,
					strokeColor: draft.strokeColor,
				},
			]);
			const scene = {
				...current.current.scenes[draft.mode],
				elements: [
					...current.current.scenes[draft.mode].elements.filter(
						(element) => element.id !== draft.id,
					),
					...elements,
				] as BoardElement[],
			};
			applying.current = true;
			api.updateScene({
				elements: restoreElements(
					scene.elements as unknown as Parameters<typeof restoreElements>[0],
					null,
				),
				captureUpdate: CaptureUpdateAction.IMMEDIATELY,
			});
			const next = await transport.request<BoardState>("scene", {
				mode: draft.mode,
				scene,
				revision: current.current.revision,
			});
			setDraft(null);
			last.current = "";
			apply(next);
		} catch (error) {
			last.current = "";
			apply(current.current);
			throw error;
		} finally {
			committing.current = false;
			setPublishingText(false);
		}
	}
	function fitScreen() {
		localView.current = fittedTabletView();
		setTabletView(localView.current);
		last.current = "";
		apply(current.current);
	}
	return (
		<div
			ref={stage}
			data-board-ready={clean && api ? "true" : undefined}
			onPointerDownCapture={(event) => {
				interacted.current = true;
				if (
					tablet &&
					drawing &&
					api &&
					!draft &&
					event.target instanceof HTMLCanvasElement &&
					api.getAppState().activeTool.type === "text"
				) {
					event.preventDefault();
					event.stopPropagation();
					const view = api.getAppState();
					openTextDraft(
						(event.clientX - view.offsetLeft) / view.zoom.value - view.scrollX,
						(event.clientY - view.offsetTop) / view.zoom.value - view.scrollY,
					);
				}
			}}
			onWheelCapture={() => {
				interacted.current = true;
			}}
			onKeyDownCapture={() => {
				interacted.current = true;
			}}
			className={`board-stage ${showMaterial ? "has-whiteboard" : ""} ${clean ? "board-clean" : ""} ${tablet ? "board-tablet" : ""}`}
		>
			{background && (
				<div
					className="board-video"
					style={
						tablet
							? {
									width: state.width * fit.scale,
									height: state.height * fit.scale,
									left: fit.left,
									top: fit.top,
									transformOrigin: "top left",
									transform: `translate(${tabletView.x * fit.scale * tabletView.zoom}px, ${tabletView.y * fit.scale * tabletView.zoom}px) scale(${tabletView.zoom})`,
								}
							: undefined
					}
				>
					{background}
				</div>
			)}
			{!(clean && state.output === "screen") && showMaterial && (
				<div
					className={`physical-board ${boardClosing ? "is-closing" : ""}`}
					aria-hidden="true"
				>
					<div className="board-enamel" />
					<span className="board-brand">
						MISTARECORDA <i>STUDIO</i>
					</span>
					<div className="marker-tray">
						<i />
						<i />
						<i />
						<b />
					</div>
				</div>
			)}
			<div
				className={`board-paper ${boardClosing ? "board-putting-away" : !tablet && cleanMode === "board" ? "board-deployed" : ""} ${tablet && (streamed || !state.enabled || state.output === "screen") ? "board-streamed-ink" : ""}`}
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
					viewModeEnabled={clean || (tablet && (!drawing || !!draft))}
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
							...(tablet
								? {
										penMode: false,
										penDetected: true,
										activeTool: {
											type: "freedraw" as const,
											locked: true,
											lastActiveTool: null,
											customType: null,
										},
									}
								: {}),
							viewBackgroundColor: "transparent",
							scrollX: initial.scenes[cleanMode].scrollX,
							scrollY: initial.scenes[cleanMode].scrollY,
							zoom: {
								value: initial.scenes[cleanMode].zoom as AppState["zoom"]["value"],
							},
						},
					}}
					onChange={(elements, view, files) => {
						if (tablet && view.penMode)
							api?.updateScene({ appState: { penMode: false, penDetected: true } });
						if (
							tablet &&
							view.editingTextElement?.type === "text" &&
							!draftRef.current
						) {
							const text = view.editingTextElement;
							const original = current.current.scenes[modeRef.current].elements.find(
								(element) => element.id === text.id,
							);
							draftRef.current = {
								mode: modeRef.current,
								id: text.id,
								x: text.x,
								y: text.y,
								text: String(original?.text ?? ""),
								fontSize: text.fontSize,
								fontFamily: text.fontFamily,
								strokeColor: text.strokeColor,
							};
							setDraft(draftRef.current);
							api?.updateScene({
								elements: restoreElements(
									withoutTextDraft(
										elements as unknown as BoardElement[],
										current.current.scenes[modeRef.current].elements,
										text.id,
									) as unknown as Parameters<typeof restoreElements>[0],
									null,
								),
								appState: { editingTextElement: null },
							});
						}
						if (clean || applying.current || !interacted.current || !api) return;
						const shared = current.current.scenes[modeRef.current];
						if (tablet) {
							const next = readTabletView(shared, fit.scale, {
								scrollX: view.scrollX,
								scrollY: view.scrollY,
								zoom: view.zoom.value,
							});
							if (JSON.stringify(next) !== JSON.stringify(localView.current)) {
								localView.current = next;
								setTabletView(next);
							}
							if (!drawing || draftRef.current) return;
						}
						const scene: BoardScene = {
							elements: tablet
								? withoutTextDraft(
										elements as unknown as BoardElement[],
										shared.elements,
										view.editingTextElement?.id ?? draftRef.current?.id,
									)
								: (elements as unknown as BoardElement[]),
							files: files as BoardScene["files"],
							scrollX: tablet ? shared.scrollX : view.scrollX,
							scrollY: tablet ? shared.scrollY : view.scrollY,
							zoom: tablet
								? shared.zoom
								: Math.max(0.1, Math.min(10, view.zoom.value / fit.scale)),
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
					{tablet && <button onClick={fitScreen}>Fit screen</button>}
					<button onClick={() => void chooseMode().catch((e) => setError(String(e)))}>
						{cleanMode === "board" ? "Put board away" : "Open whiteboard"}
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
						onClick={async () => {
							if (confirm("Clear this drawing scene? Saved scenes are kept.")) {
								await flush();
								setDraft(null);
								void transport
									.request<BoardState>("clear", { confirmed: true })
									.then((next) => apply(next))
									.catch((e) => setError(String(e)));
							}
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
			{tablet && draft && (
				<div
					className="tablet-text-draft"
					role="dialog"
					aria-label="Text draft"
					style={{
						left: Math.max(
							12,
							Math.min(
								(draft.x + (api?.getAppState().scrollX ?? 0)) *
									(api?.getAppState().zoom.value ?? 1) +
									fit.left,
								(stage.current?.clientWidth ?? 600) - 340,
							),
						),
						top: Math.max(
							12,
							Math.min(
								(draft.y + (api?.getAppState().scrollY ?? 0)) *
									(api?.getAppState().zoom.value ?? 1) +
									fit.top,
								(stage.current?.clientHeight ?? 500) - 220,
							),
						),
					}}
				>
					<label htmlFor="tablet-text">Text · visible after Done</label>
					<textarea
						id="tablet-text"
						ref={textInput}
						value={draft.text}
						placeholder="Type your annotation…"
						onChange={(event) => setDraft({ ...draft, text: event.target.value })}
					/>
					<div>
						<button
							onClick={() => {
								setDraft(null);
								last.current = "";
								apply(current.current);
							}}
						>
							Cancel
						</button>
						<button
							disabled={!draft.text.trim() || publishingText}
							onClick={() =>
								void commitText().catch((error) => setError(String(error)))
							}
						>
							Done
						</button>
					</div>
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
