import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { StudioSource } from "../../src/types/studio";
import { presenterURL } from "../../src/components/board/presenterModel";
import { getNativeMacWindowSources } from "../ipc/cursor/bounds";

const exec = promisify(execFile);
// The URL is an argument, never interpolated into executable AppleScript.
const openScript = `on run argv
 tell application "Google Chrome"
  if (count of windows) is 0 then make new window
  set w to front window
  set t to make new tab at end of tabs of w with properties {URL:item 1 of argv}
  set active tab index of w to count of tabs of w
  activate
  set b to bounds of w
  return (id of w as text) & linefeed & (id of t as text) & linefeed & (item 1 of b as text) & linefeed & (item 2 of b as text) & linefeed & (item 3 of b as text) & linefeed & (item 4 of b as text)
 end tell
end run`;
const statusScript = `on run argv
 if application "Google Chrome" is not running then return "closed"
 tell application "Google Chrome"
  repeat with w in windows
   if (id of w as text) is item 1 of argv then
    repeat with t in tabs of w
     if (id of t as text) is item 2 of argv then return "open"
    end repeat
   end if
  end repeat
 end tell
 return "closed"
end run`;

export async function openChromePresentation(value: string) {
	const url = presenterURL(value).href;
	if (process.platform !== "darwin")
		throw Error("Automatic browser presentations currently require macOS.");
	let stdout: string;
	try {
		({ stdout } = await exec("/usr/bin/osascript", ["-e", openScript, url], {
			timeout: 30000,
		}));
	} catch {
		throw Error(
			"Allow MistaRecorda to control Google Chrome in System Settings → Privacy & Security → Automation, then try the link again.",
		);
	}
	const [windowId, tabId, x, y, right, bottom] = stdout.trim().split(/\r?\n/).map(Number);
	if (![windowId, tabId, x, y, right, bottom].every(Number.isFinite))
		throw Error("Chrome did not confirm the new tab.");
	for (let i = 0; i < 15; i++) {
		const candidates = (await getNativeMacWindowSources({ maxAgeMs: 0 })).filter(
			(s) => s.appName === "Google Chrome",
		);
		const match = candidates.find(
			(s) =>
				Math.abs((s.x ?? -9999) - x) < 4 &&
				Math.abs((s.y ?? -9999) - y) < 4 &&
				Math.abs((s.width ?? 0) - (right - x)) < 8 &&
				Math.abs((s.height ?? 0) - (bottom - y)) < 8,
		);
		if (match)
			return { url, windowId, tabId, source: { ...match, sourceType: "window" as const } };
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw Error(
		"The new Chrome tab is open, but its window could not be selected. Choose Chrome under Screens & windows.",
	);
}
export async function chromePresentationOpen(windowId: number, tabId: number) {
	const { stdout } = await exec(
		"/usr/bin/osascript",
		["-e", statusScript, String(windowId), String(tabId)],
		{ timeout: 3000 },
	);
	return stdout.trim() === "open";
}

export class BrowserPresentation {
	private session?: {
		url: string;
		previous: StudioSource;
		browser: StudioSource;
		windowId: number;
		tabId: number;
	};
	private timer?: ReturnType<typeof setTimeout>;
	private busy = false;
	private revision = 0;
	constructor(
		private deps: {
			current: () => StudioSource | undefined;
			switch: (source: StudioSource) => Promise<unknown>;
			changed: () => void;
			error: (message: string) => void;
			open?: typeof openChromePresentation;
			isOpen?: typeof chromePresentationOpen;
		},
	) {}
	get state() {
		return this.session && { url: this.session.url, previousName: this.session.previous.name };
	}
	async start(url: string) {
		if (this.busy) throw Error("A browser presentation is already changing.");
		const previous = this.session?.previous ?? this.deps.current();
		if (!previous) throw Error("Choose a scene before opening a URL object.");
		this.busy = true;
		const revision = this.revision;
		try {
			const opened = await (this.deps.open ?? openChromePresentation)(url);
			if (this.revision !== revision) return; // User chose another scene while Chrome opened.
			await this.deps.switch(opened.source);
			this.cancel();
			this.session = { ...opened, previous, browser: opened.source };
			this.poll();
			this.deps.changed();
		} finally {
			this.busy = false;
		}
	}
	async finish() {
		const session = this.session;
		if (!session || this.busy) return;
		this.busy = true;
		try {
			if (this.deps.current()?.id === session.browser.id)
				await this.deps.switch(session.previous);
			this.cancel(); // Keep the Chrome tab; only end its capture override.
			this.deps.changed();
		} finally {
			this.busy = false;
		}
	}
	cancel() {
		this.revision++;
		clearTimeout(this.timer);
		this.session = undefined;
	}
	private poll() {
		this.timer = setTimeout(async () => {
			const session = this.session;
			if (!session) return;
			try {
				if (
					!(await (this.deps.isOpen ?? chromePresentationOpen)(
						session.windowId,
						session.tabId,
					)) &&
					this.session === session
				)
					await this.finish();
			} catch (error) {
				this.deps.error(String((error as Error).message));
			}
			if (this.session) this.poll();
		}, 400);
		this.timer.unref?.();
	}
}
