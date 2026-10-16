import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./hoverHelp.css";
const explanations: Record<string, string> = {
	PDFs: "Read imported PDFs privately, or ask AI to turn selected pages into a presentation draft. The PDF viewer is not recorded.",
	"Import PDF":
		"Copy a PDF from this device to your Mac. It stays private and can be read on connected iPads. Up to 6 MB and 500 pages.",
	"Remove PDF":
		"Remove this PDF from the current presentation. Existing talking points are kept.",
	"Private PDF": "Switch between the PDFs saved with this presentation.",
	"PDF page number":
		"Jump to a page in the private PDF. This does not change what your audience sees.",
	"Previous PDF page": "Read the previous PDF page privately.",
	"Next PDF page": "Read the next PDF page privately.",
	"PDF zoom": "Make the PDF easier to read on this device. It does not zoom your recording.",
	"Search PDF text":
		"Find a word or phrase in the PDF's selectable text. Scanned image pages may not contain searchable text.",
	"Find next":
		"Jump to the next page containing your search text, wrapping back to the beginning.",
	"Make presentation with AI":
		"Choose pages and a goal, then review suggested talking points and supporting objects before saving anything.",
	"Draft talking points":
		"Send only the selected PDF pages, notes and library names to OpenAI. Uses your API credits; your saved notes stay unchanged until you apply the draft.",
	"Cancel analysis":
		"Stop preparing the AI draft. Your PDF and saved notes stay intact. Work already processed by the provider may still cost credits.",
	"Draft title":
		"Name the presentation draft. This becomes the note-set name when you choose Save as new set.",
	"Add to notes":
		"Append the draft and its selected object references to the current talking points. Keep everything already there.",
	"Replace notes":
		"Replace the current talking points with this draft. Undo AI changes restores the previous notes.",
	"Save as new set":
		"Save this draft as a separate named set, keeping your current talking points.",
	"Dismiss draft": "Hide the draft review. Your saved notes remain unchanged.",
	"Talking-point set":
		"Switch between saved note sets. The selected set and saved edits sync between Mac and iPad.",
	"Manage sets":
		"Create, rename, copy or delete a talking-point set. Save unfinished edits before switching sets.",
	"Note set name":
		"Enter the name to use when creating, copying or renaming a talking-point set.",
	"Undo AI changes":
		"Restore the notes from before your last AI Add or Replace. Saved PDF and library objects remain available.",
	"Talking points":
		"Read and edit your private presenter notes. Save points to share changes between your Mac and iPad.",
	Objects:
		"Find images, memes, charts, sounds and links to reference in your notes or place during a presentation.",
	Environments:
		"Save or import your presentation setup, including canvases, note sets, objects and private PDFs. API keys are never included.",
	"Remove attached sound":
		"Make this meme silent without deleting the sound from your library. Save the meme settings to keep the change.",
	"Preview suggestion":
		"Inspect this proposed object or chart data. Previewing does not deploy it or play its audio.",
	"Source evidence":
		"Read the PDF excerpt behind this point and check its page before presenting it as a fact.",

	Record: "Start recording your selected screen or window after the countdown. Stop to open the take in the editor.",
	Board: "Open or put away the whiteboard. Drawings on the board and screen are kept separately until you clear them.",
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
							"button, input, select, textarea, summary, [role=button], [role=switch], [role=slider], [data-help], label[title]",
						)
					: null;
			if (target === active) return;
			clear();
			if (!target) return;
			active = target;
			title = target.getAttribute("title");
			oldDescribed = target.getAttribute("aria-describedby");
			const label =
				target.getAttribute("aria-label") ||
				target.closest("label")?.textContent?.trim() ||
				target.textContent?.trim() ||
				"";
			const help =
				target.dataset.help ||
				target.closest<HTMLElement>("[data-help]")?.dataset.help ||
				explanations[label] ||
				title ||
				target.closest("label[title]")?.getAttribute("title");
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
