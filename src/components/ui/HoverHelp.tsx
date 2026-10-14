import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./hoverHelp.css";
const explanations: Record<string, string> = {
	Record: "Start recording your selected screen or window. Settings panels close before capture begins.",
	Board: "Open Drawing studio to annotate your screen, open a whiteboard, or pair your iPad.",
	"Voice Change":
		"Choose an ElevenLabs voice, import a shared preset, or process a finished microphone recording.",
	"Hide HUD": "Hide the recorder toolbar. Press Command/Control + Shift + H to bring it back.",
	"Close App": "Quit MistaRecorda. Save any editor changes before closing.",
	"Enable microphone":
		"Choose and enable a microphone. Voice changing needs a separate microphone recording.",
	"Enable webcam overlay": "Choose a camera and add a webcam bubble to your recording.",
	"Countdown delay":
		"Choose how long to wait before recording starts so you can prepare your screen.",
	"Stop recording":
		"Finish this take and open it in the editor with your recorded zooms and sound cues.",
	"Pause recording": "Pause the take. Paused time is removed from the saved video.",
	"Resume recording": "Continue the current take from the point where you paused.",
	"Done drawing":
		"Return mouse control to your desktop. Your drawings remain visible in the recording.",
	"Put board away":
		"Swing the whiteboard back off the left edge. Your drawing is kept for next time.",
	"Standby images": "Open your image tray to reuse images you have already imported.",
	"Import image": "Add a PNG, JPEG, or WebP image to this scene and keep it in the image tray.",
	"Clear scene": "Clear the current canvas after confirmation. Your named saved scenes are kept.",
	Export: "Render the edited video, including your zooms, cursor effects, sound clips, and chosen audio.",
};
export function HoverHelp() {
	const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
	useEffect(() => {
		let active: HTMLElement | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let title: string | null = null;
		let oldDescribed: string | null = null;
		const clear = () => {
			clearTimeout(timer);
			setTip(null);
			if (active) {
				if (title !== null && !active.hasAttribute("title"))
					active.setAttribute("title", title);
				if (oldDescribed === null) active.removeAttribute("aria-describedby");
				else active.setAttribute("aria-describedby", oldDescribed);
			}
			active = null;
			title = null;
			oldDescribed = null;
		};
		const start = (event: Event) => {
			const target =
				event.target instanceof Element
					? event.target.closest<HTMLElement>(
							"button, input, select, summary, [role=button], [role=switch], [role=slider], [data-help], label[title]",
						)
					: null;
			if (target === active) return;
			clear();
			if (!target) return;
			active = target;
			title = target.getAttribute("title");
			oldDescribed = target.getAttribute("aria-describedby");
			const label = target.getAttribute("aria-label") || target.textContent?.trim() || "";
			const help =
				target.dataset.help ||
				target.closest<HTMLElement>("[data-help]")?.dataset.help ||
				explanations[label] ||
				title;
			if (!help) return;
			// Prevent the browser's immediate native title from competing with the delayed explanation.
			target.removeAttribute("title");
			timer = setTimeout(() => {
				if (!target.isConnected) return;
				const rect = target.getBoundingClientRect();
				const x = Math.max(
					14,
					Math.min(innerWidth - 310, rect.left + rect.width / 2 - 148),
				);
				const y =
					rect.top > 130 ? rect.top - 104 : Math.min(innerHeight - 116, rect.bottom + 12);
				target.setAttribute(
					"aria-describedby",
					[oldDescribed, "mr-hover-help"].filter(Boolean).join(" "),
				);
				setTip({ text: help, x, y: Math.max(10, y) });
			}, 3000);
		};
		const leave = (event: Event) => {
			const related = (event as MouseEvent).relatedTarget;
			if (active && related instanceof Node && active.contains(related)) return;
			clear();
		};
		document.addEventListener("pointerover", start);
		document.addEventListener("focusin", start);
		document.addEventListener("pointerout", leave);
		document.addEventListener("focusout", leave);
		document.addEventListener("pointerdown", clear);
		document.addEventListener("keydown", clear);
		document.addEventListener("scroll", clear, true);
		return () => {
			clear();
			document.removeEventListener("pointerover", start);
			document.removeEventListener("focusin", start);
			document.removeEventListener("pointerout", leave);
			document.removeEventListener("focusout", leave);
			document.removeEventListener("pointerdown", clear);
			document.removeEventListener("keydown", clear);
			document.removeEventListener("scroll", clear, true);
		};
	}, []);
	return tip
		? createPortal(
				<div
					id="mr-hover-help"
					role="tooltip"
					className="mr-hover-help"
					style={{ left: tip.x, top: tip.y }}
				>
					<p>{tip.text}</p>
				</div>,
				document.body,
			)
		: null;
}
