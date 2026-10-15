import { type MouseEvent, useCallback, useEffect, useRef } from "react";
import type { HudInteractiveBounds } from "../hudMousePassthrough";

// Only painted controls own mouse input. In particular, never include their
// transparent layout parents or the rectangle spanning two separate controls.
const INTERACTIVE_SELECTOR =
	'[data-hud-interactive], [data-slot="popover-content"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]';

export function useLaunchHudInteractionState({
	openId,
	mousePassthroughSupported,
}: {
	openId: string | null;
	mousePassthroughSupported: boolean | null;
}) {
	const publishRef = useRef<() => void>(() => {
		/* Ready after the mount effect. */
	});

	useEffect(() => {
		let lastSnapshot = "";
		let pointerDown = false;
		let frame = 0;
		const publish = () => {
			const regions: HudInteractiveBounds[] = [];
			for (const node of document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)) {
				const style = getComputedStyle(node);
				const rect = node.getBoundingClientRect();
				if (
					style.visibility === "hidden" ||
					style.display === "none" ||
					rect.width <= 0 ||
					rect.height <= 0
				)
					continue;
				regions.push({
					left: rect.left,
					top: rect.top,
					right: rect.right,
					bottom: rect.bottom,
				});
			}
			const snapshot = JSON.stringify([regions, pointerDown]);
			if (snapshot !== lastSnapshot) {
				lastSnapshot = snapshot;
				window.electronAPI?.hudOverlaySetInteractiveRegions?.(regions, pointerDown);
			}
		};
		publishRef.current = publish;
		const tick = () => {
			publish();
			frame = requestAnimationFrame(tick);
		};
		const down = (event: PointerEvent) => {
			pointerDown =
				event.target instanceof Element && !!event.target.closest(INTERACTIVE_SELECTOR);
			publish();
		};
		const release = () => {
			pointerDown = false;
			publish();
		};
		// Publish before React handles dragging; native hit testing keeps the
		// pointer captured until release even outside a control's visible bounds.
		window.addEventListener("pointerdown", down, true);
		window.addEventListener("pointerup", release, true);
		window.addEventListener("pointercancel", release, true);
		window.addEventListener("blur", release);
		tick();
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("pointerdown", down, true);
			window.removeEventListener("pointerup", release, true);
			window.removeEventListener("pointercancel", release, true);
			window.removeEventListener("blur", release);
			window.electronAPI?.hudOverlaySetInteractiveRegions?.([], false);
		};
	}, []);

	// Older Windows/Linux use a bounded native window instead of passthrough.
	useEffect(() => {
		if (mousePassthroughSupported === false)
			window.electronAPI?.hudOverlaySetIgnoreMouse?.(openId === null);
	}, [openId, mousePassthroughSupported]);
	const beginInteractiveHudAction = useCallback(() => {
		publishRef.current();
		if (mousePassthroughSupported === false)
			window.electronAPI?.hudOverlaySetIgnoreMouse?.(false);
	}, [mousePassthroughSupported]);
	const handleHudMouseEnter = beginInteractiveHudAction;
	const handleHudMouseLeave = useCallback(
		(_event: MouseEvent<HTMLDivElement>) => {
			publishRef.current();
			if (mousePassthroughSupported === false && openId === null)
				window.electronAPI?.hudOverlaySetIgnoreMouse?.(true);
		},
		[mousePassthroughSupported, openId],
	);
	return { handleHudMouseEnter, handleHudMouseLeave, beginInteractiveHudAction };
}
