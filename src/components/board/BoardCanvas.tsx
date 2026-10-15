import {
	CaptureUpdateAction,
	convertToExcalidrawElements,
	Excalidraw,
	FONT_FAMILY,
	restoreElements,
} from "@excalidraw/excalidraw";
import type {
	AppState,
	BinaryFileData,
	BinaryFiles,
	ExcalidrawImperativeAPI,
	LibraryItems,
} from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { BoardAPI, BoardElement, BoardScene, BoardState } from "../../types/board";
import type { PresenterObject } from "../../types/presenter";
import { TalkingPoints, type PlacementPoint } from "./TalkingPoints";
import type { MemeAsset } from "../../types/memes";
import { MemeLayer, MemeLibrary } from "./Memes";
import "@excalidraw/excalidraw/index.css";
import "./board.css";
import { MicrophoneIcon, SparkleIcon } from "@phosphor-icons/react";
import { BoardLaser } from "./BoardLaser";
import { clearCanvas } from "./clearCanvas";
import { FigureAssistant } from "./FigureAssistant";
import {
	duplicateObjects,
	groupObjects,
	hitObject,
	objectId,
	selectedObjects,
} from "./objectEditing";
import { Soundboard } from "./Soundboard";
import { mergeScenePatch, newSceneFiles, type ScenePatch, sceneSignature } from "./sceneSync";
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
	onEnableDrawing,
}: {
	transport: BoardAPI;
	initial: BoardState;
	clean?: boolean;
	tablet?: boolean;
	background?: React.ReactNode;
	streamed?: boolean;
	drawing?: boolean;
	onEnableDrawing?: () => Promise<void>;
}) {
	const stage = useRef<HTMLDivElement>(null);
	const paper = useRef<HTMLDivElement>(null);
	const clientTag = useRef(objectId());
	const resetGeneration = useRef(0);
	const [fit, setFit] = useState({ scale: 1, left: 0, top: 0 });
	const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
	const [state, setState] = useState(initial);
	const [error, setError] = useState("");
	const [assets, setAssets] = useState(false);
	const [ai, setAi] = useState(false);
	const [sounds, setSounds] = useState(false);
	const [memes, setMemes] = useState(false);
	const [pendingMeme, setPendingMeme] = useState<MemeAsset>();
	const [memeSettings, setMemeSettings] = useState<string>();
	const [pendingImage, setPendingImage] = useState<{
		object: PresenterObject;
		width: number;
		height: number;
	}>();
	const [dragGhost, setDragGhost] = useState<{
		object: PresenterObject;
		point: PlacementPoint;
	}>();
	const [memePoint, setMemePoint] = useState({ x: 100, y: 100 });
	const [memeView, setMemeView] = useState({ x: 0, y: 0, zoom: 1 });
	const [selected, setSelected] = useState<Record<string, boolean>>({});
	const [multiSelect, setMultiSelect] = useState(false);
	const [clipboard, setClipboard] = useState<{
		elements: BoardElement[];
		files: BinaryFiles;
	} | null>(null);
	const [capturing, setCapturing] = useState(false);
	const laserTime = useRef(0);
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
	// biome-ignore lint/correctness/useExhaustiveDependencies: These layout values determine the cached DOM origin refreshed by the imperative API.
	useLayoutEffect(() => {
		// Excalidraw caches its DOM origin. Refit/rotation can move the paper
		// without resizing it, so refresh after React has positioned it.
		api?.refresh();
	}, [api, fit.left, fit.top, fit.scale, state.width, state.height]);

	useEffect(() => () => clearTimeout(closeTimer.current), []);
	async function flush(): Promise<void> {
		if (inFlight.current) {
			await inFlight.current;
			if (pending.current) await flush();
			return;
		}
		if (!pending.current) return;
		const edit = pending.current;
		const generation = resetGeneration.current;
		pending.current = null;
		saving.current = true;
		inFlight.current = (async () => {
			try {
				const reply = await transport.request<{ revision: number }>("scene", {
					...edit,
					scene: {
						...edit.scene,
						files: newSceneFiles(edit.scene, current.current.scenes[edit.mode].files),
					},
					revision: current.current.revision,
					tag: clientTag.current,
				});
				if (
					generation === resetGeneration.current &&
					reply.revision >= current.current.revision
				) {
					current.current = mergeScenePatch(current.current, {
						...edit,
						revision: reply.revision,
					});
					setState(current.current);
				}
				setError("");
			} catch (e) {
				if (generation !== resetGeneration.current) return;
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
			const signature = sceneSignature(scene);
			const actual = api.getAppState();
			if (
				signature === last.current &&
				mode === modeRef.current &&
				Math.abs(actual.zoom.value - viewport.zoom) < 0.0001 &&
				Math.abs(actual.scrollX - viewport.scrollX) < 0.0001 &&
				Math.abs(actual.scrollY - viewport.scrollY) < 0.0001
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
	useEffect(() => {
		const patch = transport.on<ScenePatch>("sceneUpdate", (update) => {
			const next = mergeScenePatch(current.current, update);
			if (update.tag === clientTag.current) {
				current.current = next;
				setState(next);
			} else apply(next);
		});
		const reset = transport.on<BoardState>("sceneReset", (next) => {
			resetGeneration.current++;
			pending.current = null;
			clearTimeout(timer.current);
			timer.current = undefined;
			interacted.current = false;
			setDraft(null);
			last.current = "";
			applying.current = true;
			if (api) clearCanvas(api);
			// A clear supersedes in-flight edits; their older replies are ignored by revision.
			const wasSaving = saving.current;
			saving.current = false;
			apply(next);
			saving.current = wasSaving;
		});
		return () => {
			patch();
			reset();
		};
	}, [transport, api, apply]);
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
	// biome-ignore lint/correctness/useExhaustiveDependencies: Placement is intentionally canceled when switching surfaces.
	useEffect(() => {
		setPendingMeme(undefined);
		setPendingImage(undefined);
		setDragGhost(undefined);
	}, [state.mode]);
	useEffect(
		() =>
			transport.on<MemeAsset>("memePlacement", (asset) => {
				if (!clean) setPendingMeme(asset);
			}),
		[transport, clean],
	);
	const memeCoordinates = (clientX: number, clientY: number) => {
		const view = api!.getAppState();
		return {
			x: (clientX - view.offsetLeft) / view.zoom.value - view.scrollX,
			y: (clientY - view.offsetTop) / view.zoom.value - view.scrollY,
		};
	};
	async function chooseMode() {
		await flush();
		const next = await transport.request<BoardState>("mode", {
			mode: modeRef.current === "board" ? "screen" : "board",
		});
		apply(next);
	}
	async function addImage(file: File) {
		if (!drawing) throw Error("Turn Draw on to import an image.");
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
	function placeImage(
		fileId: string,
		width = 320,
		height = 240,
		point?: { x: number; y: number },
		placedWidth?: number,
	) {
		if (!drawing && !point) {
			setError("Turn Draw on to place an image.");
			return;
		}
		if (!api) return;
		const file = current.current.assets[fileId];
		if (file) api.addFiles([file] as BinaryFileData[]);
		interacted.current = true;
		const view = api.getAppState();
		const w = placedWidth ?? Math.min(width, 600);
		const element = convertToExcalidrawElements([
			{
				type: "image",
				fileId,
				x: point?.x ?? -view.scrollX + 120 / view.zoom.value,
				y: point?.y ?? -view.scrollY + 120 / view.zoom.value,
				width: w,
				height: (w * height) / width,
			},
		] as Parameters<typeof convertToExcalidrawElements>[0]);
		api.updateScene({
			elements: [...api.getSceneElements(), ...element],
			appState: {
				selectedElementIds: Object.fromEntries(element.map((e) => [e.id, true])),
				selectedGroupIds: {},
			},
			captureUpdate: CaptureUpdateAction.IMMEDIATELY,
		});
	}
	async function usePresenterObject(object: PresenterObject, client?: PlacementPoint) {
		if (!api) throw Error("The canvas is still loading. Try again in a moment.");
		if (!drawing && onEnableDrawing) {
			await onEnableDrawing();
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		}
		api.refresh();
		const point = client ? memeCoordinates(client.x, client.y) : undefined;
		setPendingMeme(undefined);
		setPendingImage(undefined);
		if (object.kind === "meme") {
			const asset = current.current.memes?.find((m) => m.id === object.id);
			if (!asset) throw Error("This meme is no longer available.");
			if (point) {
				await flush();
				await transport.request("placeMeme", {
					assetId: asset.id,
					mode: modeRef.current,
					...point,
					width: Math.min(360, current.current.width * 0.3),
				});
			} else {
				setMemePoint(
					memeCoordinates(
						(paper.current?.getBoundingClientRect().left ?? 0) + 100,
						(paper.current?.getBoundingClientRect().top ?? 0) + 160,
					),
				);
				setPendingMeme(asset);
			}
		} else if (object.kind === "image") {
			const file = current.current.assets[object.id];
			if (!file) throw Error("This image is no longer available.");
			const image = new Image();
			image.src = file.dataURL;
			await image.decode();
			if (point) {
				placeImage(
					file.id,
					image.width,
					image.height,
					point,
					(current.current.width * (object.widthPercent ?? 30)) / 100,
				);
				api.setActiveTool({ type: "selection" });
			} else {
				setMemePoint(
					memeCoordinates(
						(paper.current?.getBoundingClientRect().left ?? 0) + 100,
						(paper.current?.getBoundingClientRect().top ?? 0) + 160,
					),
				);
				setPendingImage({ object, width: image.width, height: image.height });
			}
		}
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
			const reply = await transport.request<{ revision: number }>("scene", {
				mode: draft.mode,
				scene,
				revision: current.current.revision,
			});
			setDraft(null);
			last.current = "";
			apply(
				mergeScenePatch(current.current, {
					mode: draft.mode,
					scene,
					revision: reply.revision,
				}),
			);
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
	function editObjects(elements: readonly BoardElement[], select?: Record<string, boolean>) {
		if (!api) return;
		interacted.current = true;
		api.updateScene({
			elements: restoreElements(elements as Parameters<typeof restoreElements>[0], null),
			appState: select
				? {
						selectedElementIds: Object.fromEntries(
							Object.keys(select)
								.filter((id) => select[id])
								.map((id) => [id, true as const]),
						),
						selectedGroupIds: {},
					}
				: undefined,
			captureUpdate: CaptureUpdateAction.IMMEDIATELY,
		});
	}
	function copyObjects() {
		if (!api) return;
		const elements = selectedObjects(
			api.getSceneElements() as unknown as BoardElement[],
			api.getAppState().selectedElementIds,
		);
		if (elements.length)
			setClipboard({
				elements: structuredClone(elements),
				files: structuredClone(api.getFiles()),
			});
	}
	function pasteObjects(duplicate = false) {
		if (!api) return;
		const source = duplicate
			? {
					elements: selectedObjects(
						api.getSceneElements() as unknown as BoardElement[],
						api.getAppState().selectedElementIds,
					),
					files: api.getFiles(),
				}
			: clipboard;
		if (!source?.elements.length) return;
		api.addFiles(Object.values(source.files));
		const copies = duplicateObjects(source.elements);
		editObjects(
			[...(api.getSceneElements() as unknown as BoardElement[]), ...copies],
			Object.fromEntries(copies.map((e) => [e.id, true])),
		);
	}
	const selectedCount = Object.values(selected).filter(Boolean).length;
	return (
		<div
			ref={stage}
			data-board-ready={clean && api ? "true" : undefined}
			onPointerDownCapture={(event) => {
				if (pendingImage && api && event.target instanceof HTMLCanvasElement) {
					event.preventDefault();
					event.stopPropagation();
					api.refresh();
					placeImage(
						pendingImage.object.id,
						pendingImage.width,
						pendingImage.height,
						memeCoordinates(event.clientX, event.clientY),
						(current.current.width * (pendingImage.object.widthPercent ?? 30)) / 100,
					);
					api.setActiveTool({ type: "selection" });
					setPendingImage(undefined);
					return;
				}
				if (pendingMeme && api && event.target instanceof HTMLCanvasElement) {
					event.preventDefault();
					event.stopPropagation();
					const point = memeCoordinates(event.clientX, event.clientY);
					void flush()
						.then(() =>
							transport.request("placeMeme", {
								assetId: pendingMeme.id,
								mode: modeRef.current,
								...point,
								width: Math.min(360, current.current.width * 0.3),
							}),
						)
						.then(() => {
							setPendingMeme(undefined);
							if (!tablet && modeRef.current === "screen")
								return transport.request("hideEditor");
						})
						.catch((e) => setError(String(e)));
					return;
				}
				if (api && paper.current && event.target instanceof HTMLCanvasElement) {
					const rect = paper.current.getBoundingClientRect();
					const view = api.getAppState();
					if (
						Math.abs(view.offsetLeft - rect.left) > 0.5 ||
						Math.abs(view.offsetTop - rect.top) > 0.5
					)
						flushSync(() => api.refresh());
				}
				interacted.current = true;
				if (multiSelect && api && event.target instanceof HTMLCanvasElement) {
					event.preventDefault();
					event.stopPropagation();
					const view = api.getAppState();
					const elements = api.getSceneElements() as unknown as BoardElement[];
					const hit = hitObject(
						elements,
						(event.clientX - view.offsetLeft) / view.zoom.value - view.scrollX,
						(event.clientY - view.offsetTop) / view.zoom.value - view.scrollY,
					);
					if (hit) {
						const group = (hit.groupIds as string[] | undefined)?.slice(-1)[0];
						const targets = group
							? elements.filter((e) =>
									(e.groupIds as string[] | undefined)?.includes(group),
								)
							: [hit];
						const ids = { ...view.selectedElementIds };
						const value = !ids[hit.id];
						for (const e of targets) {
							if (value) ids[e.id] = true;
							else delete ids[e.id];
						}
						api.updateScene({
							appState: { selectedElementIds: ids, selectedGroupIds: {} },
						});
					}
					return;
				}
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
			onPointerMoveCapture={(event) => {
				if ((pendingMeme || pendingImage) && api)
					setMemePoint(memeCoordinates(event.clientX, event.clientY));
				if (
					clean ||
					!drawing ||
					event.buttons === 0 ||
					!api ||
					api.getAppState().activeTool.type !== "laser" ||
					!(event.target instanceof HTMLCanvasElement) ||
					Date.now() - laserTime.current < 30
				)
					return;
				laserTime.current = Date.now();
				const view = api.getAppState();
				void transport
					.request("laser", {
						mode: modeRef.current,
						x: (event.clientX - view.offsetLeft) / view.zoom.value - view.scrollX,
						y: (event.clientY - view.offsetTop) / view.zoom.value - view.scrollY,
					})
					.catch((e) => setError(String(e)));
			}}
			onWheelCapture={() => {
				interacted.current = true;
			}}
			onKeyDownCapture={(event) => {
				if ((pendingMeme || pendingImage) && event.key === "Escape") {
					event.stopPropagation();
					setPendingMeme(undefined);
					setPendingImage(undefined);
				}
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
				ref={paper}
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
						setMemeView((old) =>
							old.x === view.scrollX &&
							old.y === view.scrollY &&
							old.zoom === view.zoom.value
								? old
								: { x: view.scrollX, y: view.scrollY, zoom: view.zoom.value },
						);
						setSelected((old) =>
							JSON.stringify(old) === JSON.stringify(view.selectedElementIds)
								? old
								: view.selectedElementIds,
						);
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
						const signature = sceneSignature(scene);
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
			<div
				className={`meme-paper ${boardClosing ? "board-putting-away" : !tablet && cleanMode === "board" ? "board-deployed" : ""}`}
				style={{
					visibility: clean && state.output === "screen" ? "hidden" : "visible",
					left: fit.left,
					top: fit.top,
					width: state.width * fit.scale,
					height: state.height * fit.scale,
				}}
			>
				<MemeLayer
					state={state}
					mode={boardClosing ? "board" : cleanMode}
					view={memeView}
					clean={clean || !drawing}
					transport={transport}
				/>
				{(pendingMeme || pendingImage) && (
					<img
						className="meme-ghost"
						src={pendingMeme?.dataURL ?? pendingImage?.object.preview}
						alt="Object placement preview"
						style={{
							left: (memePoint.x + memeView.x) * memeView.zoom,
							top: (memePoint.y + memeView.y) * memeView.zoom,
							width:
								(pendingImage
									? (state.width * (pendingImage.object.widthPercent ?? 30)) / 100
									: Math.min(360, state.width * 0.3)) * memeView.zoom,
						}}
					/>
				)}
			</div>
			{(pendingMeme || pendingImage) && (
				<button
					className="meme-cancel"
					onClick={() => {
						setPendingMeme(undefined);
						setPendingImage(undefined);
					}}
				>
					Tap to place · Cancel
				</button>
			)}
			{!clean && tablet && (
				<TalkingPoints
					transport={transport}
					state={state}
					onPlace={usePresenterObject}
					onPreview={(object, point) =>
						setDragGhost(object && point ? { object, point } : undefined)
					}
					onMemeSettings={(id) => {
						setMemeSettings(id);
						setMemes(true);
						setSounds(false);
						setAi(false);
					}}
				/>
			)}
			{dragGhost &&
				(dragGhost.object.preview ? (
					<img
						className="presenter-drag-ghost"
						alt="Drag placement preview"
						src={dragGhost.object.preview}
						style={{
							left: dragGhost.point.x,
							top: dragGhost.point.y,
							width:
								((state.width * (dragGhost.object.widthPercent ?? 30)) / 100) *
								memeView.zoom,
						}}
					/>
				) : (
					<span
						className="presenter-drag-ghost presenter-drag-label"
						style={{ left: dragGhost.point.x, top: dragGhost.point.y }}
					>
						{dragGhost.object.kind === "link" ? "Open in Chrome" : "Play sound"} ·{" "}
						{dragGhost.object.name}
					</span>
				))}
			{clean && <BoardLaser transport={transport} state={state} />}
			{!clean && drawing && (
				<div className="board-object-tools" aria-label="Object editing">
					<button
						title="Select an object to move or resize it. Drag across empty space to select several."
						onClick={() => {
							setMultiSelect(false);
							api?.setActiveTool({ type: "selection" });
						}}
					>
						Select
					</button>
					<button
						aria-pressed={multiSelect}
						onClick={() => {
							setMultiSelect(!multiSelect);
							api?.setActiveTool({ type: "selection" });
						}}
					>
						Select multiple
					</button>
					<span>
						{selectedCount
							? `${selectedCount} selected`
							: multiSelect
								? "Tap objects to select"
								: "Each stroke is an object"}
					</span>
					<button disabled={!selectedCount} onClick={copyObjects}>
						Copy
					</button>
					<button disabled={!clipboard || !drawing} onClick={() => pasteObjects()}>
						Paste
					</button>
					<button disabled={!selectedCount} onClick={() => pasteObjects(true)}>
						Duplicate
					</button>
					<button
						disabled={selectedCount < 2}
						onClick={() =>
							api &&
							editObjects(
								groupObjects(
									api.getSceneElements() as unknown as BoardElement[],
									selected,
								),
							)
						}
					>
						Group
					</button>
					<button
						disabled={!selectedCount}
						onClick={() =>
							api &&
							editObjects(
								groupObjects(
									api.getSceneElements() as unknown as BoardElement[],
									selected,
									true,
								),
							)
						}
					>
						Ungroup
					</button>
				</div>
			)}
			{!clean && (
				<div className="board-actions">
					{tablet && <button onClick={fitScreen}>Fit screen</button>}
					<button
						disabled={capturing}
						onClick={async () => {
							setCapturing(true);
							try {
								await flush();
								apply(await transport.request<BoardState>("captureStill"));
							} catch (e) {
								setError(String(e));
							} finally {
								setCapturing(false);
							}
						}}
					>
						{capturing ? "Capturing…" : "Capture Mac screen"}
					</button>
					<button onClick={() => void chooseMode().catch((e) => setError(String(e)))}>
						{cleanMode === "board" ? "Put board away" : "Open whiteboard"}
					</button>
					<button onClick={() => setAssets(!assets)}>Standby images</button>
					<button
						aria-expanded={memes}
						onClick={() => {
							setMemes(!memes);
							setSounds(false);
							setAi(false);
						}}
					>
						Memes
					</button>
					<button
						aria-expanded={ai}
						onClick={() => {
							setAi(!ai);
							setSounds(false);
						}}
					>
						<SparkleIcon size={15} />
						<MicrophoneIcon size={16} /> AI
					</button>
					<button
						aria-expanded={sounds}
						onClick={() => {
							setSounds(!sounds);
							setAi(false);
						}}
					>
						Soundboard
					</button>
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
							{
								pending.current = null;
								clearTimeout(timer.current);
								timer.current = undefined;
								setDraft(null);
								interacted.current = false;
								applying.current = true;
								if (api) clearCanvas(api);
								void transport
									.request<BoardState>("clear", { confirmed: true })
									.then((next) => apply(next))
									.catch((e) => setError(String(e)));
							}
						}}
					>
						{cleanMode === "board" ? "Clear whiteboard" : "Clear drawings"}
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
			{!clean && memes && (
				<MemeLibrary
					transport={transport}
					state={state}
					initialEditId={memeSettings}
					onChoose={(asset) => {
						setPendingImage(undefined);
						setPendingMeme(asset);
					}}
					onClose={() => {
						setMemes(false);
						setMemeSettings(undefined);
					}}
				/>
			)}
			{!clean && ai && <FigureAssistant transport={transport} onClose={() => setAi(false)} />}
			{!clean && sounds && (
				<Soundboard transport={transport} onClose={() => setSounds(false)} />
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
					{Object.values(state.assets).map((f) => (
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
