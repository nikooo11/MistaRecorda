import type { BoardAPI, BoardState } from "../../types/board";
import type { ScenePatch } from "./sceneSync";
import { whiteboardView } from "./whiteboards";

/** Only the selected draft is substituted. The underlying transport and Mac retain
 * the active board, so browsing an inactive tab cannot publish it. */
export function whiteboardTransport(
	base: BoardAPI,
	getState: () => BoardState | undefined,
	getId: () => string | null,
	followMac: () => void,
): BoardAPI {
	return {
		async request<T>(method: string, input?: unknown): Promise<T> {
			const id = getId(),
				state = getState();
			const data = (input && typeof input === "object" ? input : {}) as Record<
				string,
				unknown
			>;
			const privateDraft = !!id && id !== (state?.activeWhiteboardId ?? "default");
			if (id && method === "annotate" && state) return whiteboardView(state, id) as T;
			if (id && method === "scene" && data.mode === "board")
				input = { ...data, whiteboardId: id };
			if (id && method === "clear") {
				method = "clearWhiteboard";
				input = { ...data, whiteboardId: id };
			}
			if (id && method === "mode") {
				followMac();
				return base.request<T>("mode", input);
			}
			// These operations currently target the live scene. Never silently apply them
			// to a different, visible whiteboard while the presenter is preparing a draft.
			if (
				privateDraft &&
				[
					"captureStill",
					"aiImport",
					"aiImportGenerated",
					"importPresenterImage",
					"setObjectShadow",
					"placeMeme",
					"removeMeme",
					"updateMeme",
					"shakeMeme",
					"setMemeShadow",
					"loadScene",
				].includes(method)
			)
				throw Error(
					"Activate this whiteboard with its red circle before using this action. Drawings, text and imported images can be prepared privately.",
				);
			if (privateDraft && method === "laser") return true as T;
			const result = await base.request<T>(method, input);
			if (result && typeof result === "object" && "scenes" in result)
				return whiteboardView(result as unknown as BoardState, getId()) as T;
			return result;
		},
		on<T>(event: string, callback: (data: T) => void) {
			if (event === "state")
				return base.on<{ state: BoardState; origin: string }>(event, (data) =>
					callback({ ...data, state: whiteboardView(data.state, getId()) } as T),
				);
			if (event === "sceneUpdate")
				return base.on<ScenePatch>(event, (p) => {
					const id = getId();
					if (
						id &&
						(p.mode !== "board" ||
							(p.whiteboardId ?? getState()?.activeWhiteboardId ?? "default") !== id)
					)
						return;
					callback((id ? { ...p, whiteboardId: undefined } : p) as T);
				});
			if (event === "sceneReset") {
				const off = base.on<BoardState>(event, (s) => {
					callback(whiteboardView(s, getId()) as T);
				});
				const reset = base.on<{ id: string; state: BoardState }>("whiteboardReset", (v) => {
					if (
						getId() === v.id ||
						(!getId() && v.id === (v.state.activeWhiteboardId ?? "default"))
					)
						callback(whiteboardView(v.state, getId()) as T);
				});
				return () => {
					off();
					reset();
				};
			}
			return base.on(event, callback);
		},
	};
}
