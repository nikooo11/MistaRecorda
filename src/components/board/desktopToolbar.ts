import { useEffect, type RefObject } from "react";
import type { BoardAPI } from "../../types/board";
import { clampPanel } from "./tabletPanels";

type Bounds = { left: number; top: number; width: number; height: number };

/** Move controls only: the canvas must retain the full display's coordinate origin. */
export function useDesktopToolbar(
	stage: RefObject<HTMLDivElement>,
	enabled: boolean,
	transport: BoardAPI,
	mode: string,
) {
	useEffect(() => {
		const root = stage.current;
		if (!enabled || !root) return;
		let disposed = false;
		let area: Bounds = {
			left: 0,
			top: /Mac/.test(navigator.platform) ? 44 : 8,
			width: innerWidth,
			height: innerHeight - 88,
		};
		let position: { x: number; y: number } | undefined;
		let panel: HTMLElement | null = null;
		let grip: HTMLButtonElement | null = null;
		let originalStyle: string | null = null;
		let drag: { id: number; x: number; y: number; left: number; top: number } | undefined;
		const render = () => {
			if (!panel) return;
			const viewport = root.getBoundingClientRect();
			const bounds = {
				left: Math.max(area.left, viewport.left),
				top: Math.max(area.top, viewport.top),
				width: Math.min(area.width, viewport.width),
				height: Math.min(area.height, viewport.height - area.top),
			};
			panel.style.maxWidth = `${Math.max(120, bounds.width - 16)}px`;
			panel.style.maxHeight = `${Math.max(60, bounds.height - 16)}px`;
			const size = panel.getBoundingClientRect();
			const preferred = position || {
				x: bounds.left + (bounds.width - size.width) / 2,
				y: bounds.top + 10,
			};
			const next = clampPanel(preferred.x, preferred.y, size.width, size.height, bounds);
			if (position) position = next;
			panel.style.left = `${next.x - viewport.left}px`;
			panel.style.top = `${next.y - viewport.top}px`;
		};
		const detach = () => {
			if (!panel) return;
			observer.unobserve(panel);
			panel.classList.remove("desktop-drawing-toolbar");
			if (originalStyle === null) panel.removeAttribute("style");
			else panel.setAttribute("style", originalStyle);
			grip?.remove();
			panel = null;
			grip = null;
			drag = undefined;
		};
		const attach = () => {
			const next = root.querySelector<HTMLElement>(".excalidraw .App-toolbar");
			if (next === panel) return;
			detach();
			if (!next) return;
			panel = next;
			originalStyle = panel.getAttribute("style");
			panel.classList.add("desktop-drawing-toolbar");
			grip = document.createElement("button");
			grip.type = "button";
			grip.className = "desktop-toolbar-grip";
			grip.textContent = "⠿";
			grip.setAttribute("aria-label", "Move drawing toolbar");
			grip.dataset.help =
				"Drag to move the drawing tools. Arrow keys also move this bar. It returns near the top when you close and reopen the whiteboard or drawing tools.";
			grip.onpointerdown = (e) => {
				if (e.button !== 0 || !panel || !grip) return;
				e.preventDefault();
				e.stopPropagation();
				const at = panel.getBoundingClientRect();
				drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: at.left, top: at.top };
				grip.setPointerCapture(e.pointerId);
			};
			grip.onpointermove = (e) => {
				if (!drag || drag.id !== e.pointerId) return;
				e.stopPropagation();
				position = { x: drag.left + e.clientX - drag.x, y: drag.top + e.clientY - drag.y };
				render();
			};
			grip.onpointerup = grip.onpointercancel = (e) => {
				e.stopPropagation();
				drag = undefined;
			};
			grip.onlostpointercapture = () => {
				drag = undefined;
			};
			grip.onkeydown = (e) => {
				const delta = {
					ArrowLeft: [-12, 0],
					ArrowRight: [12, 0],
					ArrowUp: [0, -12],
					ArrowDown: [0, 12],
				}[e.key];
				if (!delta || !panel) return;
				e.preventDefault();
				e.stopPropagation();
				const at = panel.getBoundingClientRect();
				position = { x: at.left + delta[0], y: at.top + delta[1] };
				render();
			};
			grip.onclick = (e) => e.stopPropagation();
			panel.prepend(grip);
			observer.observe(panel);
			render();
		};
		const observer = new ResizeObserver(render);
		observer.observe(root);
		const mutations = new MutationObserver(attach);
		mutations.observe(root, { subtree: true, childList: true });
		const updateArea = (next: Bounds) => {
			if (
				!next ||
				![next.left, next.top, next.width, next.height].every(Number.isFinite) ||
				next.width <= 0 ||
				next.height <= 0
			)
				return;
			area = next;
			render();
		};
		const reset = transport.on<Bounds>("toolbarReset", (next) => {
			position = undefined;
			updateArea(next);
			render();
		});
		const resize = transport.on<Bounds>("toolbarBounds", updateArea);
		void transport
			.request<Bounds>("editorWorkArea")
			.then((next) => {
				if (!disposed) updateArea(next);
			})
			.catch(() => undefined);
		attach();
		return () => {
			disposed = true;
			mutations.disconnect();
			observer.disconnect();
			reset();
			resize();
			detach();
		};
	}, [stage, enabled, transport, mode]);
}
