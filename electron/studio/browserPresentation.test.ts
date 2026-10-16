import { afterEach, expect, test, vi } from "vitest";
vi.mock("../ipc/cursor/bounds", () => ({ getNativeMacWindowSources: vi.fn() }));
import { BrowserPresentation } from "./browserPresentation";
import type { StudioSource } from "../../src/types/studio";
const screen: StudioSource = { id: "screen:1:0", name: "Display", sourceType: "screen" };
const chrome: StudioSource = { id: "window:4:0", name: "Chrome", sourceType: "window" };
afterEach(() => vi.useRealTimers());
function setup() {
	let current = screen;
	const change = vi.fn(async (s: StudioSource) => {
		current = s;
	});
	const open = vi.fn(async (url: string) => ({ url, source: chrome, tabId: 5, windowId: 4 }));
	const isOpen = vi.fn(async () => true);
	const presentation = new BrowserPresentation({
		current: () => current,
		switch: change,
		open,
		isOpen,
		changed: vi.fn(),
		error: vi.fn(),
	});
	return { presentation, change, open, isOpen };
}
test("URL capture restores the original source across repeated links, retaining tabs", async () => {
	const s = setup();
	await s.presentation.start("https://example.com/a");
	await s.presentation.start("https://example.com/b");
	expect(s.presentation.state?.previousName).toBe("Display");
	await s.presentation.finish();
	expect(s.change.mock.calls.map(([source]) => source.id)).toEqual([
		chrome.id,
		chrome.id,
		screen.id,
	]);
	expect(s.presentation.state).toBeUndefined();
});
test("closing the presented tab restores the scene; manually switching cancels that restore", async () => {
	vi.useFakeTimers();
	const s = setup();
	await s.presentation.start("https://example.com");
	s.isOpen.mockResolvedValue(false);
	await vi.advanceTimersByTimeAsync(500);
	expect(s.change).toHaveBeenLastCalledWith(screen);
	await s.presentation.start("https://example.com");
	s.presentation.cancel();
	await vi.advanceTimersByTimeAsync(1000);
	expect(s.change).toHaveBeenLastCalledWith(chrome);
});
test("a failed browser switch leaves the previous source and presentation state intact", async () => {
	const s = setup();
	s.change.mockRejectedValueOnce(Error("unavailable"));
	await expect(s.presentation.start("https://example.com")).rejects.toThrow("unavailable");
	expect(s.presentation.state).toBeUndefined();
});
test("changing scenes while Chrome opens never takes capture back from the user", async () => {
	const s = setup();
	let opened!: () => void;
	s.open.mockImplementationOnce(
		(url) =>
			new Promise((resolve) => {
				opened = () => resolve({ url, source: chrome, tabId: 5, windowId: 4 });
			}),
	);
	const request = s.presentation.start("https://example.com");
	s.presentation.cancel();
	opened();
	await request;
	expect(s.change).not.toHaveBeenCalled();
	expect(s.presentation.state).toBeUndefined();
});
