import { expect, test } from "vitest";
import { ownsShortcutCapture } from "./shortcutCapture";
test("closing Capture settings does not break shortcut capture in another window", () => {
	const sender = {};
	const closed = {
		isDestroyed: () => true,
		get webContents(): object {
			throw Error("Object has been destroyed");
		},
	};
	expect(ownsShortcutCapture(closed, sender)).toBe(false);
	expect(ownsShortcutCapture(undefined, sender)).toBe(false);
	expect(ownsShortcutCapture({ isDestroyed: () => false, webContents: sender }, sender)).toBe(
		true,
	);
	expect(ownsShortcutCapture({ isDestroyed: () => false, webContents: {} }, sender)).toBe(false);
});
