import { beforeEach, expect, test, vi } from "vitest";
const host = vi.hoisted(() => ({ windows: [] as any[], load: vi.fn(), show: vi.fn() }));
vi.mock("electron", () => ({
	app: { getAppPath: () => "/app" },
	BrowserWindow: class {
		destroyed = false;
		webContents = { getURL: () => "http://127.0.0.1:9876/?windowType=settings-guide" };
		constructor(public options: unknown) {
			host.windows.push(this);
		}
		static getAllWindows() {
			return host.windows;
		}
		isDestroyed() {
			return this.destroyed;
		}
		setContentProtection() {}
		loadURL(url: string) {
			return host.load(url);
		}
		show() {
			host.show();
		}
		focus() {}
		hide() {}
		destroy() {
			this.destroyed = true;
		}
	},
}));
vi.mock("../rendererServer", () => ({
	getPackagedRendererBaseUrl: () => "http://127.0.0.1:9876/",
}));
beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	host.windows = [];
	delete process.env.VITE_DEV_SERVER_URL;
});
test("coalesces first-launch opens while loading and reuses the existing tutorial", async () => {
	let ready!: () => void;
	host.load.mockReturnValue(
		new Promise<void>((resolve) => {
			ready = resolve;
		}),
	);
	const { openSettingsGuide } = await import("./settingsGuide");
	const first = openSettingsGuide();
	const second = openSettingsGuide();
	expect(host.windows).toHaveLength(1);
	expect(host.show).not.toHaveBeenCalled();
	ready();
	await Promise.all([first, second]);
	expect(host.show).toHaveBeenCalledTimes(1);
	await openSettingsGuide();
	expect(host.windows).toHaveLength(1);
	expect(host.show).toHaveBeenCalledTimes(2);
	host.windows[0].destroy();
	await openSettingsGuide();
	expect(host.windows).toHaveLength(2);
});
test("load failure destroys the empty window and a later open can retry", async () => {
	host.load.mockRejectedValueOnce(Error("unavailable"));
	const { openSettingsGuide } = await import("./settingsGuide");
	await expect(openSettingsGuide()).rejects.toThrow("unavailable");
	expect(host.windows[0].destroyed).toBe(true);
	host.load.mockResolvedValue(undefined);
	await openSettingsGuide();
	expect(host.windows).toHaveLength(2);
	expect(host.show).toHaveBeenCalledTimes(1);
});
