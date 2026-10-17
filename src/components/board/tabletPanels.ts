import { useEffect, useState, type RefObject } from "react";
import {
	changeTabletPanel,
	type TabletPanelAction,
	type TabletPanelState,
} from "./tabletPanelState";

export function clampPanel(
	x: number,
	y: number,
	width: number,
	height: number,
	bounds: { left: number; top: number; width: number; height: number },
) {
	return {
		x: Math.max(bounds.left + 4, Math.min(x, bounds.left + bounds.width - width - 4)),
		y: Math.max(
			bounds.top + 4,
			Math.min(y, bounds.top + bounds.height - Math.min(height, bounds.height - 8) - 4),
		),
	};
}
const dockedPanels = new Set([
	"Whiteboards",
	"Soundboard",
	"Memes",
	"AI figures",
	"Points to talk about",
	"Standby images",
	"Object editing",
	"AI Chart",
	"Present chart",
]);
export function toggleTabletPanel(root: HTMLElement | null, name: string) {
	const panel =
		root &&
		[...root.querySelectorAll<HTMLElement>(".tablet-floating-panel")].find(
			(p) => p.dataset.tabletPanel === name,
		);
	if (!panel) return false;
	root!.dispatchEvent(new CustomEvent("tablet-panel-toggle", { detail: name }));
	return true;
}
type Layout = { x: number; y: number; collapsed: boolean };
const selectors = [
	[".tablet-text-draft", "Text"],
	[".tablet-colors", "Colors"],
	[".board-tray", "Panel"],
	[".talking-panel", "Talking points"],
	[".board-assets", "Standby images"],
	[".board-object-tools", "Objects"],
	[".board-actions", "Actions"],
	[".excalidraw .App-toolbar", "Drawing tools"],
	[".excalidraw .selected-shape-actions", "Style"],
	[".excalidraw .App-mobile-menu", "Style"],
	[".excalidraw .sidebar", "Library"],
] as const;

/** Adapt both our React panels and Excalidraw's conditionally mounted tool islands.
 * Only the added handle owns dragging; inputs, scrolling and canvas gestures keep
 * their normal behavior. Local layout never enters shared/recorded board state. */
export function useTabletPanels(stage: RefObject<HTMLDivElement>, enabled: boolean) {
	const [revision, setRevision] = useState(0);
	useEffect(() => {
		const root = stage.current;
		if (!enabled || !root) return;
		let front = 180;
		const mounted = new Map<HTMLElement, () => void>();
		const layouts = new Map<string, Layout>();
		const attach = (panel: HTMLElement, fallback: string) => {
			if (mounted.has(panel)) return;
			const name = panel.getAttribute("aria-label") || fallback;
			const key = `mistarecorda.panel.v1.${name}`;
			let saved = layouts.get(key);
			try {
				saved ??= JSON.parse(localStorage.getItem(key) || "null");
			} catch {
				/* Private browsing. */
			}
			if (
				saved &&
				(!Number.isFinite(saved.x) ||
					!Number.isFinite(saved.y) ||
					typeof saved.collapsed !== "boolean")
			)
				saved = undefined;
			const docked = dockedPanels.has(name);
			panel.dataset.tabletPanel = name;
			panel.dataset.tabletDocked = String(docked);
			const originalStyle = panel.getAttribute("style");
			const bounds = root.getBoundingClientRect();
			const dock =
				fallback === "Colors"
					? { x: bounds.left + 6, y: bounds.top + 56 }
					: fallback === "Style"
						? { x: bounds.left + 6, y: bounds.top + 370 }
						: fallback === "Drawing tools"
							? { x: bounds.left + 6, y: bounds.top + 6 }
							: fallback === "Objects"
								? { x: bounds.right - 156, y: bounds.top + 6 }
								: fallback === "Actions"
									? { x: bounds.right - 156, y: bounds.bottom - 44 }
									: name === "AI Chart"
										? // Between the left (memes, notes) and right (sounds, AI) docks.
											bounds.width >= 1000
											? {
													x:
														bounds.left +
														Math.max(66, bounds.width / 2 - 200),
													y: bounds.top + 54,
												}
											: // Portrait: under the soundboard in the right column.
												{ x: bounds.right - 366, y: bounds.top + 310 }
										: name === "Present chart"
											? { x: bounds.left + 66, y: bounds.bottom - 300 }
											: {
													x: ["Memes", "Points to talk about"].includes(
														name,
													)
														? bounds.left + 66
														: bounds.right - 366,
													y:
														bounds.top +
														(name === "AI figures"
															? 220
															: name === "Points to talk about"
																? 350
																: 54),
												};
			let layout = saved || {
				...dock,
				collapsed: ["Objects", "Style", "Drawing tools", "Actions"].includes(fallback),
			};
			if (docked && fallback !== "Objects") layout = { ...layout, collapsed: false };
			let presentation: TabletPanelState = {
				collapsed: layout.collapsed,
				minimized: false,
				fullScreen: false,
			};
			const bar = document.createElement("div");
			bar.className = "tablet-panel-handle";
			const grip = document.createElement("button");
			grip.type = "button";
			grip.textContent = fallback === "Colors" ? "⠿" : `⠿ ${name}`;
			grip.setAttribute("aria-label", `Move ${name}`);
			grip.title = "Drag to move. Arrow keys move this panel.";
			const toggle = document.createElement("button");
			toggle.type = "button";
			const minimize = document.createElement("button");
			minimize.type = "button";
			minimize.className = "tablet-panel-minimize";
			minimize.setAttribute("aria-label", `Minimize ${name} to side dock`);
			minimize.innerHTML = '<span aria-hidden="true">−</span>';
			minimize.dataset.help =
				"Hide this panel in the right side dock. Tap its icon to reopen it expanded, at the same position.";
			// Private reference reading can fill the iPad without changing the Mac canvas.
			const expand =
				name === "Points to talk about" ? document.createElement("button") : null;
			bar.append(grip);
			if (expand) {
				expand.type = "button";
				expand.dataset.help =
					"Fill the iPad with your private PDF or talking points. Tap again to return to the movable panel. This never changes the recording.";
				bar.append(expand);
			}
			bar.append(toggle, minimize);
			toggle.className = "tablet-panel-collapse";
			toggle.dataset.help =
				"Collapse to a draggable title bar. Tap plus to expand. Use the yellow button to hide the panel in the side dock.";
			panel.prepend(bar);
			panel.classList.add("tablet-floating-panel");
			const raise = () => {
				if (front >= 990) {
					for (const other of mounted.keys()) other.style.zIndex = "180";
					front = 180;
				}
				panel.style.zIndex = presentation.fullScreen ? "1000" : String(++front);
			};
			raise();
			panel.addEventListener("pointerdown", raise, true);
			const save = () => {
				layouts.set(key, { ...layout });
				try {
					localStorage.setItem(key, JSON.stringify(layout));
				} catch {
					/* Optional preference. */
				}
			};
			let restore: HTMLButtonElement | null = null;
			const render = () => {
				const { collapsed, minimized, fullScreen } = presentation;
				const reading = fullScreen && !collapsed && !minimized;
				panel.classList.toggle("tablet-panel-fullscreen", reading);
				panel.classList.toggle("tablet-panel-collapsed", collapsed);
				panel.classList.toggle("tablet-panel-minimized", minimized);
				panel.inert = minimized;
				if (expand) {
					expand.textContent = fullScreen ? "↙" : "⛶";
					expand.setAttribute(
						"aria-label",
						fullScreen
							? "Return to floating panel"
							: "Expand private reference to full screen",
					);
					expand.setAttribute("aria-pressed", String(fullScreen));
				}
				let hasLauncher = false;
				for (const launch of root.querySelectorAll<HTMLElement>("[data-panel-target]")) {
					if (launch.dataset.panelTarget === name) {
						launch.setAttribute("aria-expanded", String(!minimized));
						hasLauncher = true;
					}
				}
				// Tool islands without a permanent side icon still need an obvious way back.
				if (minimized && !hasLauncher && !restore) {
					restore = document.createElement("button");
					restore.type = "button";
					restore.dataset.panelTarget = name;
					restore.setAttribute("aria-label", `Reopen ${name}`);
					restore.setAttribute("aria-expanded", "false");
					const icon = document.createElement("span");
					icon.textContent = "▣";
					icon.setAttribute("aria-hidden", "true");
					const label = document.createElement("small");
					label.textContent = name;
					restore.append(icon, label);
					restore.onclick = () => update("open");
					root.querySelector(".tablet-launcher")?.append(restore);
				} else if (!minimized && restore) {
					restore.remove();
					restore = null;
				}
				const symbol = collapsed ? "+" : "−";
				if (toggle.textContent !== symbol) toggle.textContent = symbol;
				toggle.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${name}`);
				toggle.setAttribute("aria-expanded", String(!collapsed));
				if (minimized) return;
				const bounds = root.getBoundingClientRect();
				if (expand) {
					panel.style.width = reading ? `${Math.max(100, bounds.width - 8)}px` : "";
					panel.style.height = reading ? `${Math.max(100, bounds.height - 8)}px` : "";
				}
				const size = panel.getBoundingClientRect();
				const position = clampPanel(layout.x, layout.y, size.width, size.height, {
					left: bounds.left,
					top: bounds.top,
					height: bounds.height,
					width: Math.max(100, bounds.width - 54),
				});
				Object.assign(panel.style, {
					left: `${reading ? bounds.left + 4 : position.x}px`,
					top: `${reading ? bounds.top + 4 : position.y}px`,
					right: "auto",
					bottom: "auto",
					transform: "none",
				});
			};
			let drag: { id: number; x: number; y: number; left: number; top: number } | undefined;
			grip.onpointerdown = (e) => {
				if (e.button !== 0 || presentation.fullScreen) return;
				e.preventDefault();
				e.stopPropagation();
				const at = panel.getBoundingClientRect();
				drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: at.left, top: at.top };
				grip.setPointerCapture(e.pointerId);
			};
			grip.onpointermove = (e) => {
				if (!drag || drag.id !== e.pointerId) return;
				layout.x = drag.left + e.clientX - drag.x;
				layout.y = drag.top + e.clientY - drag.y;
				render();
			};
			grip.onpointerup = grip.onpointercancel = () => {
				drag = undefined;
				save();
			};
			grip.onkeydown = (e) => {
				if (presentation.fullScreen) return;
				const delta = {
					ArrowLeft: [-12, 0],
					ArrowRight: [12, 0],
					ArrowUp: [0, -12],
					ArrowDown: [0, 12],
				}[e.key];
				if (!delta) return;
				e.preventDefault();
				e.stopPropagation();
				const at = panel.getBoundingClientRect();
				layout.x = at.left + delta[0];
				layout.y = at.top + delta[1];
				render();
				save();
			};
			const update = (action: TabletPanelAction) => {
				presentation = changeTabletPanel(presentation, action);
				layout.collapsed = presentation.collapsed;
				if (!presentation.minimized) raise();
				render();
				save();
				if (presentation.minimized) {
					const launch = [
						...root.querySelectorAll<HTMLElement>("[data-panel-target]"),
					].find((button) => button.dataset.panelTarget === name);
					launch?.focus({ preventScroll: true });
				} else if (action === "open") grip.focus({ preventScroll: true });
			};
			toggle.onclick = () => update("collapse");
			minimize.onclick = () => update("minimize");
			if (expand) expand.onclick = () => update("fullScreen");
			const requestToggle = (e: Event) => {
				if ((e as CustomEvent).detail === name) update("dock");
			};
			root.addEventListener("tablet-panel-toggle", requestToggle);
			const stop = (e: Event) => e.stopPropagation();
			// Stop after the target control has received its event; never swallow its click.
			for (const event of [
				"pointerdown",
				"pointermove",
				"pointerup",
				"touchstart",
				"touchmove",
				"touchend",
			])
				panel.addEventListener(event, stop);
			const resize = new ResizeObserver(() => render());
			resize.observe(root);
			resize.observe(panel);
			render();
			mounted.set(panel, () => {
				resize.disconnect();
				panel.removeEventListener("pointerdown", raise, true);
				root.removeEventListener("tablet-panel-toggle", requestToggle);
				delete panel.dataset.tabletPanel;
				delete panel.dataset.tabletDocked;
				bar.remove();
				restore?.remove();
				panel.inert = false;
				panel.classList.remove(
					"tablet-floating-panel",
					"tablet-panel-collapsed",
					"tablet-panel-fullscreen",
					"tablet-panel-minimized",
				);
				if (originalStyle === null) panel.removeAttribute("style");
				else panel.setAttribute("style", originalStyle);
				for (const event of [
					"pointerdown",
					"pointermove",
					"pointerup",
					"touchstart",
					"touchmove",
					"touchend",
				])
					panel.removeEventListener(event, stop);
			});
		};
		const scan = () => {
			for (const [panel, dispose] of mounted)
				if (!root.contains(panel)) {
					dispose();
					mounted.delete(panel);
				}
			for (const [selector, title] of selectors)
				root.querySelectorAll<HTMLElement>(selector).forEach((panel) => {
					// Controls attached to a canvas object follow that object, not the dock.
					if (panel.dataset.panelAttached !== "true") attach(panel, title);
				});
		};
		const observer = new MutationObserver(scan);
		observer.observe(root, { childList: true, subtree: true });
		scan();
		return () => {
			observer.disconnect();
			for (const dispose of mounted.values()) dispose();
		};
	}, [stage, enabled, revision]);
	return () => {
		try {
			Object.keys(localStorage)
				.filter((key) => key.startsWith("mistarecorda.panel.v1."))
				.forEach((key) => localStorage.removeItem(key));
		} catch {
			/* Layout also resets when storage is unavailable. */
		}
		setRevision((value) => value + 1);
	};
}
