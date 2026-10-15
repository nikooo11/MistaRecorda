import { useEffect, useState, type RefObject } from "react";

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
											{ x: bounds.left + Math.max(66, bounds.width / 2 - 200), y: bounds.top + 54 }
										: name === "Present chart"
											? { x: bounds.left + 66, y: bounds.bottom - 300 }
											: {
											x: ["Memes", "Points to talk about"].includes(name)
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
			const bar = document.createElement("div");
			bar.className = "tablet-panel-handle";
			const grip = document.createElement("button");
			grip.type = "button";
			grip.textContent = fallback === "Colors" ? "⠿" : `⠿ ${name}`;
			grip.setAttribute("aria-label", `Move ${name}`);
			grip.title = "Drag to move. Arrow keys move this panel.";
			const toggle = document.createElement("button");
			toggle.type = "button";
			bar.append(grip, toggle);
			panel.prepend(bar);
			panel.classList.add("tablet-floating-panel");
			const raise = () => {
				if (front >= 990) {
					for (const other of mounted.keys()) other.style.zIndex = "180";
					front = 180;
				}
				panel.style.zIndex = String(++front);
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
			const render = () => {
				panel.classList.toggle("tablet-panel-collapsed", layout.collapsed);
				for (const launch of root.querySelectorAll<HTMLElement>("[data-panel-target]")) {
					if (launch.dataset.panelTarget === name)
						launch.setAttribute("aria-expanded", String(!layout.collapsed));
				}
				const symbol = layout.collapsed ? "+" : "−";
				if (toggle.textContent !== symbol) toggle.textContent = symbol;
				toggle.setAttribute(
					"aria-label",
					`${layout.collapsed ? "Expand" : "Collapse"} ${name}`,
				);
				toggle.setAttribute("aria-expanded", String(!layout.collapsed));
				const bounds = root.getBoundingClientRect();
				const size = panel.getBoundingClientRect();
				const position = clampPanel(layout.x, layout.y, size.width, size.height, {
					left: bounds.left,
					top: bounds.top,
					height: bounds.height,
					width: Math.max(100, bounds.width - 54),
				});
				Object.assign(panel.style, {
					left: `${position.x}px`,
					top: `${position.y}px`,
					right: "auto",
					bottom: "auto",
					transform: "none",
				});
			};
			let drag: { id: number; x: number; y: number; left: number; top: number } | undefined;
			grip.onpointerdown = (e) => {
				if (e.button !== 0) return;
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
			const togglePanel = () => {
				layout.collapsed = !layout.collapsed;
				if (!layout.collapsed) raise();
				render();
				save();
			};
			toggle.onclick = togglePanel;
			const requestToggle = (e: Event) => {
				if ((e as CustomEvent).detail === name) togglePanel();
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
				panel.classList.remove("tablet-floating-panel", "tablet-panel-collapsed");
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
