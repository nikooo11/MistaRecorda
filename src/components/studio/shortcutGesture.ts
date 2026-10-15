import { shortcutFromKey, type ShortcutPlatform } from "./shortcuts";

export interface ShortcutKeyEvent {
	key: string;
	code: string;
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
}
const isModifier = (key: string) => ["Meta", "Control", "Alt", "Shift"].includes(key);

/** Collect a chord until every key is released; preserve modifiers released first. */
export class ShortcutGesture {
	private held = new Map<string, ShortcutKeyEvent>();
	private primary?: ShortcutKeyEvent;
	private modifiers = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
	private invalid = false;
	private shortcut = "";
	reset() {
		this.held.clear();
		this.primary = undefined;
		this.modifiers = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
		this.invalid = false;
		this.shortcut = "";
	}
	update(event: ShortcutKeyEvent, down: boolean, platform: ShortcutPlatform) {
		const id = event.code || event.key;
		if (down) {
			if (!isModifier(event.key)) {
				if (this.primary && this.primary.code !== event.code) this.invalid = true;
				this.primary = event;
			}
			this.held.set(id, event);
			for (const key of ["metaKey", "ctrlKey", "altKey", "shiftKey"] as const)
				this.modifiers[key] ||= event[key];
			if (this.primary)
				this.shortcut = shortcutFromKey({ ...this.primary, ...this.modifiers }, platform);
		} else {
			this.held.delete(id);
			// Some native input paths coalesce modifier keyups into the final key event.
			const flags: Record<
				string,
				keyof Pick<ShortcutKeyEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey">
			> = { Meta: "metaKey", Control: "ctrlKey", Alt: "altKey", Shift: "shiftKey" };
			for (const [code, held] of this.held) {
				const flag = flags[held.key];
				if (flag && !event[flag]) this.held.delete(code);
			}
			// macOS can omit a letter's keyup while Command is held. Releasing Command
			// ends that chord; the event's remaining modifier flags still prevent saving early.
			if (event.key === "Meta")
				for (const [key, value] of this.held)
					if (!isModifier(value.key)) this.held.delete(key);
		}
		const allReleased =
			!down &&
			this.held.size === 0 &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.shiftKey;
		const result = {
			shortcut: this.shortcut,
			complete: allReleased && !!this.shortcut && !this.invalid,
			error: this.invalid
				? "Use one letter or function key, with optional Command, Control, Option/Alt or Shift."
				: "",
		};
		if (allReleased) this.reset();
		return result;
	}
}
