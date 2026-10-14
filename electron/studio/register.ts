import { normalizeShortcut, recorderShortcuts } from "../../src/components/studio/shortcuts";
import { setCaptureCanvasAspect } from "./geometry";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain } from "electron";
import { getPackagedRendererBaseUrl } from "../rendererServer";
import { getFfmpegBinaryPath, getFfprobeBinaryPath } from "../ipc/ffmpeg/binary";
import {
	getNativeMacWindowSources,
	resolveMacWindowBounds,
	startWindowBoundsCapture,
} from "../ipc/cursor/bounds";
import {
	getCursorCaptureElapsedMs,
	getRecordingBoundsInDips,
	isCursorCapturePaused,
} from "../ipc/cursor/telemetry";
import { closeHeldZoom, zoomStatus } from "../ipc/zoom/capture";
import {
	isCursorCaptureActive,
	nativeCaptureProcess,
	nativeScreenRecordingActive,
	selectedSource,
	selectedWindowBounds,
	setSelectedSource,
	setSelectedWindowBounds,
} from "../ipc/state";
import {
	resolveApprovedLocalMediaPath,
	rememberApprovedLocalReadPath,
} from "../ipc/project/manager";
import { assertBoardCaptureSource, isDrawingSurfaceWindow, sendRecordingControl } from "../board/register";
import { requireScreenRecordingAccess } from "../screenCaptureAccess";
import type { AudioRegion } from "../../src/components/video-editor/types";
import type { StudioSettings, StudioInfo, StudioSource } from "../../src/types/studio";
import { SoundTake, studioSettingsSchema, shortcutSchema, sourceSchema } from "./model";
const exec = promisify(execFile);
let settings: StudioSettings = studioSettingsSchema.parse({ glow: true, windows: [], sounds: [] });
let message = "";
let switching = false;
let take = new SoundTake();
let savedPath: string | null = null;
let panel: BrowserWindow | undefined;
let shortcutCaptureOwner: Electron.WebContents | undefined;
let shortcutCaptureTimer: ReturnType<typeof setTimeout> | undefined;
function endShortcutCapture() {
	clearTimeout(shortcutCaptureTimer);
	shortcutCaptureOwner = undefined;
	globalShortcut.setSuspended(false);
}
let glow: BrowserWindow | undefined;
let glowTimer: ReturnType<typeof setInterval> | undefined;
const bindings = new Set<string>();
const root = () => path.join(app.getPath("userData"), "studio");
const info = (): StudioInfo => ({
	settings,
	recording: isCursorCaptureActive,
	switching,
	canSwitch: process.platform === "darwin",
	selectedName: selectedSource?.name ?? "Choose a source",
	message,
});
function publish() {
	for (const w of BrowserWindow.getAllWindows())
		if (!w.isDestroyed() && !w.webContents.isDestroyed())
			w.webContents.send("studio:changed", info());
}
async function save() {
	await fs.mkdir(root(), { recursive: true });
	const tmp = path.join(root(), `settings-${crypto.randomUUID()}.tmp`);
	await fs.writeFile(tmp, JSON.stringify(settings), { mode: 0o600 });
	await fs.rename(tmp, path.join(root(), "settings.json"));
	publish();
}
function fireSound(id: string) {
	const sound = settings.sounds.find((s) => s.id === id);
	if (!sound) throw Error("Sound not found.");
	if (!isCursorCaptureActive)
		throw Error("Start recording to add a sound. Use Preview to listen first.");
	if (
		take.trigger(
			id,
			path.join(root(), sound.file),
			sound.durationMs,
			sound.volume,
			getCursorCaptureElapsedMs(),
			isCursorCapturePaused(),
		)
	) {
		message = `${sound.name} added to your take`;
		publish();
	}
}
function bindAll(next: StudioSettings) {
	const desired = [
		{ shortcut: next.cameraShortcut, run: () => void sendRecordingControl("webcam") },
		...next.scenes.map((scene) => ({
			shortcut: scene.shortcut,
			run: () => void applyScene(scene.id).catch((e) => { message = e.message; publish(); }),
		})),
		...next.windows.map((w) => ({
			shortcut: w.shortcut,
			run: () =>
				void switchWindow(w.source).catch((e) => {
					message = e.message;
					publish();
				}),
		})),
		...next.sounds.map((s) => ({
			shortcut: s.shortcut,
			run: () => {
				try {
					fireSound(s.id);
				} catch (e) {
					message = String((e as Error).message);
					publish();
				}
			},
		})),
	].filter((b) => b.shortcut);
	const keys = desired.map((b) =>
		normalizeShortcut(
			b.shortcut,
			process.platform === "darwin"
				? "darwin"
				: process.platform === "win32"
					? "win32"
					: "linux",
		),
	);
	if (new Set(keys).size !== keys.length) throw Error("Each shortcut can only have one action.");
	for (const fixed of recorderShortcuts)
		if (keys.includes(normalizeShortcut(fixed.shortcut, process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "win32" : "linux")))
			throw Error(`That shortcut is assigned to ${fixed.name}. Choose another combination.`);
	// Check conflicts before replacing working bindings.
	for (const b of desired)
		if (!bindings.has(b.shortcut) && globalShortcut.isRegistered(b.shortcut))
			throw Error(`${b.shortcut} is already in use.`);
	const previous = settings;
	for (const key of bindings) globalShortcut.unregister(key);
	bindings.clear();
	for (const b of desired) {
		if (!globalShortcut.register(b.shortcut, b.run)) {
			for (const key of bindings) globalShortcut.unregister(key);
			bindings.clear();
			if (next !== previous) bindAll(previous);
			throw Error(`${b.shortcut} is unavailable. Choose another combination.`);
		}
		bindings.add(b.shortcut);
	}
}
async function applyScene(id: string) {
	const scene = settings.scenes.find((s) => s.id === id);
	if (!scene) throw Error("Choose a saved scene.");
	if (switching) throw Error("A source switch is already in progress.");
	if (isCursorCaptureActive) {
		// Never change the camera if the source switch fails.
		if (scene.source.id !== selectedSource?.id) {
			if (scene.source.sourceType !== "window" || !selectedSource?.id?.startsWith("window:"))
				throw Error("Stop recording to switch displays. Window scenes can switch during a window recording.");
			await switchWindow(scene.source);
		}
	} else if (process.platform === "darwin" && scene.source.sourceType === "window") {
		await switchWindow(scene.source);
	} else {
		requireScreenRecordingAccess();
		const sources = await desktopCapturer.getSources({ types: [scene.source.sourceType], thumbnailSize: { width: 0, height: 0 } });
		const source = sources.find((s) => scene.source.sourceType === "screen" && scene.source.display_id
			? s.display_id === scene.source.display_id : s.id === scene.source.id);
		if (!source) throw Error("This scene’s source is unavailable. Edit the scene and choose an open source.");
		const next = { ...scene.source, id: source.id };
		assertBoardCaptureSource(next);
		setSelectedSource(next);
		for (const w of BrowserWindow.getAllWindows()) w.webContents.send("selected-source-changed", next);
	}
	await sendRecordingControl(scene.camera ? "webcam-on" : "webcam-off");
	message = `Scene: ${scene.name}`;
	publish();
}
export async function switchWindow(input: StudioSource) {
	if (switching) throw Error("A source switch is already in progress.");
	const target = sourceSchema.parse(input);
	if (process.platform !== "darwin")
		throw Error("Live window switching currently requires native macOS capture.");
	assertBoardCaptureSource(target);
	switching = true;
	publish();
	try {
		const sources = await getNativeMacWindowSources({ maxAgeMs: 0 });
		const found =
			sources.find(
				(s) => s.id === target.id && (!target.appName || s.appName === target.appName),
			) ??
			(target.appName && target.windowTitle
				? sources.find(
						(s) => s.appName === target.appName && s.windowTitle === target.windowTitle,
					)
				: undefined);
		if (!found) throw Error("That window is closed. Reassign it in Capture settings.");
		const next: StudioSource = { ...target, id: found.id, name: found.name };
		const bounds = await resolveMacWindowBounds({ ...next });
		if (!bounds) throw Error("That window is not currently available.");
		if (isCursorCaptureActive) {
			const child = nativeCaptureProcess;
			if (
				!nativeScreenRecordingActive ||
				!child ||
				!selectedSource?.id?.startsWith("window:")
			)
				throw Error("Start a native window recording before switching windows.");
			const id = Number(next.id.split(":")[1]);
			await new Promise<void>((resolve, reject) => {
				let buffer = "";
				const clean = () => {
					clearTimeout(timer);
					child.stdout.off("data", read);
					child.off("exit", exited);
				};
				const read = (chunk: Buffer) => {
					buffer += chunk.toString();
					if (buffer.includes(`SOURCE_SWITCHED ${id}\n`)) {
						clean();
						resolve();
					} else if (buffer.includes("SOURCE_SWITCH_FAILED")) {
						clean();
						reject(
							Error(
								"Could not switch to that window. The current recording continues.",
							),
						);
					}
				};
				const exited = () => {
					clean();
					reject(Error("Recording ended before the window changed."));
				};
				const timer = setTimeout(() => {
					clean();
					reject(Error("The recorder did not confirm the switch."));
				}, 5000);
				child.stdout.on("data", read);
				child.once("exit", exited);
				child.stdin.write(`switch-window ${id}\n`);
			});
			closeHeldZoom(getCursorCaptureElapsedMs());
		}
		setSelectedSource({ ...next });
		await startWindowBoundsCapture();
		setSelectedWindowBounds(bounds);
		for (const w of BrowserWindow.getAllWindows())
			w.webContents.send("selected-source-changed", next);
		message = `Recording source: ${next.name}`;
	} finally {
		switching = false;
		publish();
	}
}
export function startStudioTake() {
	setCaptureCanvasAspect(
		process.platform === "darwin" &&
			nativeScreenRecordingActive &&
			selectedSource?.id?.startsWith("window:") &&
			selectedWindowBounds
			? selectedWindowBounds.width / selectedWindowBounds.height
			: null,
	);
	take = new SoundTake();
	savedPath = null;
	message = "";
	clearInterval(glowTimer);
	let lastBounds = "";
	glowTimer = setInterval(() => {
		if (
			!isCursorCaptureActive ||
			!settings.glow ||
			!zoomStatus().outlineAvailable ||
			isCursorCapturePaused()
		) {
			glow?.hide();
			return;
		}
		const b = selectedSource?.id?.startsWith("window:")
			? selectedWindowBounds
			: getRecordingBoundsInDips();
		if (!b || !glow || glow.isDestroyed()) return;
		const key = JSON.stringify(b);
		if (key !== lastBounds) {
			glow.setBounds({
				x: Math.round(b.x) - 5,
				y: Math.round(b.y) - 5,
				width: Math.round(b.width) + 10,
				height: Math.round(b.height) + 10,
			});
			lastBounds = key;
		}
		if (!glow.isVisible()) glow.showInactive();
	}, 100);
	publish();
}
export function stopStudioTake() {
	setCaptureCanvasAspect(null);
	clearInterval(glowTimer);
	glow?.hide();
	publish();
}
export async function persistStudioTake(videoPath: string) {
	if (!take.regions.length || (savedPath && savedPath !== videoPath)) return;
	savedPath = videoPath;
	// Keep sounds beside the recording so moving the original imports cannot break a project.
	const files = new Map<string, string>();
	for (const r of take.regions)
		if (!files.has(r.audioPath)) {
			const copy = `${videoPath}.sound-${files.size}.wav`;
			await fs.copyFile(r.audioPath, copy);
			files.set(r.audioPath, copy);
		}
	const regions = take.regions.map((r) => ({
		...r,
		audioPath: path.basename(files.get(r.audioPath)!),
	}));
	await fs.writeFile(`${videoPath}.sounds.json`, JSON.stringify({ version: 1, regions }));
}
export async function prepareStudioCapture() {
	if (!glow || glow.isDestroyed()) {
		glow = new BrowserWindow({
			title: "MistaRecorda Capture Glow",
			frame: false,
			transparent: true,
			show: false,
			focusable: false,
			skipTaskbar: true,
			alwaysOnTop: true,
			hasShadow: false,
			webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
		});
		glow.setIgnoreMouseEvents(true);
		glow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
		if (process.platform === "win32") glow.setContentProtection(true);
		await glow.loadURL(
			`data:text/html,${encodeURIComponent("<style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}div{position:absolute;inset:4px;border:1px solid #9ce4ce88;border-radius:12px;box-shadow:0 0 4px 2px #70d1b033,inset 0 0 4px #70d1b022}</style><div></div>")}`,
		);
	}
	for (const w of BrowserWindow.getAllWindows()) {
		const kind = new URL(w.webContents.getURL() || "about:blank").searchParams.get(
			"windowType",
		);
		if (w !== glow && !isDrawingSurfaceWindow(w) && kind !== "countdown") w.hide();
		if (process.platform === "win32" && !isDrawingSurfaceWindow(w))
			w.setContentProtection(true);
	}
}
async function openPanel() {
	if (panel && !panel.isDestroyed()) {
		panel.show();
		panel.focus();
		return;
	}
	panel = new BrowserWindow({
		title: "MistaRecorda — Capture settings",
		width: 820,
		height: 620,
		minWidth: 660,
		minHeight: 560,
		backgroundColor: "#28292d",
		webPreferences: {
			preload: path.join(app.getAppPath(), "dist-electron/preload.mjs"),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
		},
	});
	panel.setContentProtection(true);
	const base =
		process.env.VITE_DEV_SERVER_URL ||
		getPackagedRendererBaseUrl() ||
		pathToFileURL(path.join(app.getAppPath(), "dist/index.html")).href;
	panel.on("blur", endShortcutCapture);
	panel.on("closed", endShortcutCapture);
	panel.webContents.on("render-process-gone", endShortcutCapture);
	await panel.loadURL(`${base}?windowType=studio`);
}
export function registerStudio() {
	app.on("browser-window-created", (_, window) => {
		if (process.platform === "win32" && window.getTitle() !== "MistaRecorda Drawing Surface")
			window.setContentProtection(true);
	});
	const ready = fs
		.readFile(path.join(root(), "settings.json"), "utf8")
		.then((s) => {
			settings = studioSettingsSchema.parse(JSON.parse(s));
			bindAll(settings);
		})
		.catch((e) => {
			if (e.code !== "ENOENT")
				message = "Some saved shortcuts could not be restored. Review Capture settings.";
			else bindAll(settings);
		});
	ipcMain.handle("studio:request", async (e, method, input) => {
		const u = new URL(e.senderFrame?.url ?? "about:blank");
		u.search = "";
		u.hash = "";
		const trusted = [
			process.env.VITE_DEV_SERVER_URL,
			getPackagedRendererBaseUrl(),
			pathToFileURL(path.join(app.getAppPath(), "dist/index.html")).href,
		].some((b) => b && new URL(b).href === u.href);
		if (!trusted || e.senderFrame !== e.sender.mainFrame)
			throw Error("Untrusted studio request");
		await ready;
		if (method === "shortcutCapture") {
			if (input === true) {
				if (isCursorCaptureActive) throw Error("Stop recording before editing shortcuts.");
				if (!panel || panel.webContents !== e.sender)
					throw Error("Open Capture settings to edit shortcuts.");
				shortcutCaptureOwner = e.sender;
				globalShortcut.setSuspended(true);
				clearTimeout(shortcutCaptureTimer);
				shortcutCaptureTimer = setTimeout(endShortcutCapture, 60000);
			} else if (shortcutCaptureOwner === e.sender) endShortcutCapture();
			return info();
		}
		if (method === "info") return info();
		if (method === "prepareCapture") {
			await prepareStudioCapture();
			return info();
		}
		if (method === "open") {
			await openPanel();
			return info();
		}
		if (method === "fireSound") {
			fireSound(String(input));
			return info();
		}
		if (method === "switch") {
			const slot = settings.windows.find((w) => w.slot === input);
			if (!slot) throw Error("Assign a window first.");
			await switchWindow(slot.source);
			return info();
		}
		if (method === "applyScene") {
			await applyScene(String(input));
			return info();
		}
		if (method === "soundsForVideo") {
			const video =
				typeof input === "string" ? await resolveApprovedLocalMediaPath(input) : null;
			if (!video) return [];
			try {
				const file = `${video}.sounds.json`;
				const stat = await fs.lstat(file);
				if (stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) return [];
				const data = JSON.parse(await fs.readFile(file, "utf8"));
				if (data.version !== 1 || !Array.isArray(data.regions)) return [];
				const regions: AudioRegion[] = [];
				for (const r of data.regions.slice(0, 4096)) {
					if (
						typeof r.audioPath !== "string" ||
						path.basename(r.audioPath) !== r.audioPath ||
						!r.audioPath.startsWith(path.basename(video) + ".sound-") ||
						!Number.isFinite(r.startMs) ||
						!Number.isFinite(r.endMs) ||
						r.startMs < 0 ||
						r.endMs <= r.startMs ||
						!Number.isFinite(r.volume) ||
						r.volume < 0 ||
						r.volume > 2
					)
						continue;
					const audioPath = path.join(path.dirname(video), r.audioPath);
					const stat = await fs.lstat(audioPath);
					if (!stat.isFile() || stat.isSymbolicLink()) continue;
					rememberApprovedLocalReadPath(audioPath);
					regions.push({ ...r, audioPath });
				}
				return regions;
			} catch {
				return [];
			}
		}
		if (isCursorCaptureActive && method !== "soundPath")
			throw Error("Stop recording before changing capture settings.");
		if (method === "glow") {
			settings.glow = Boolean(input);
			await save();
			return info();
		}
		if (method === "cameraShortcut" || method === "saveScene" || method === "removeScene") {
			const next = studioSettingsSchema.parse({
				...settings,
				...(method === "cameraShortcut" ? { cameraShortcut: input } : {}),
				...(method === "saveScene" ? { scenes: [...settings.scenes.filter((s) => s.id !== input?.id), input] } : {}),
				...(method === "removeScene" ? { scenes: settings.scenes.filter((s) => s.id !== input) } : {}),
			});
			bindAll(next);
			settings = next;
			await save();
			return info();
		}
		if (method === "assignWindow") {
			const slot = Number(input?.slot);
			if (!Number.isInteger(slot) || slot < 1 || slot > 6)
				throw Error("Invalid window slot.");
			const source = sourceSchema.parse(input.source);
			if (source.sourceType !== "window") throw Error("Choose an application window.");
			const shortcut = shortcutSchema.parse(input.shortcut);
			const next = {
				...settings,
				windows: [
					...settings.windows.filter((w) => w.slot !== slot),
					{ slot, source, shortcut },
				].sort((a, b) => a.slot - b.slot),
			};
			bindAll(next);
			settings = next;
			await save();
			return info();
		}
		if (method === "removeWindow") {
			const next = { ...settings, windows: settings.windows.filter((w) => w.slot !== input) };
			bindAll(next);
			settings = next;
			await save();
			return info();
		}
		if (method === "importSound") {
			if (settings.sounds.length >= 24) throw Error("You can keep up to 24 sound effects.");
			const result = await dialog.showOpenDialog({
				title: "Import sound effect",
				properties: ["openFile"],
				filters: [
					{
						name: "Audio clips",
						extensions: ["wav", "mp3", "m4a", "ogg", "flac", "aac"],
					},
				],
			});
			if (result.canceled) return info();
			const original = result.filePaths[0];
			if ((await fs.stat(original)).size > 25 * 1024 * 1024)
				throw Error("Choose an audio clip under 25 MB.");
			const { stdout } = await exec(
				getFfprobeBinaryPath(),
				[
					"-v",
					"error",
					"-show_entries",
					"format=duration",
					"-of",
					"default=noprint_wrappers=1:nokey=1",
					original,
				],
				{ timeout: 15000 },
			);
			const durationMs = Math.round(Number(stdout.trim()) * 1000);
			if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 120000)
				throw Error("Choose a sound between 0 and 120 seconds.");
			const id = crypto.randomUUID();
			const file = `${id}.wav`;
			await fs.mkdir(root(), { recursive: true });
			await exec(
				getFfmpegBinaryPath(),
				[
					"-y",
					"-i",
					original,
					"-vn",
					"-ac",
					"2",
					"-ar",
					"48000",
					"-c:a",
					"pcm_s16le",
					path.join(root(), file),
				],
				{ timeout: 30000 },
			);
			settings.sounds.push({
				id,
				file,
				name: path.parse(original).name.slice(0, 100),
				durationMs,
				shortcut: "",
				volume: 1,
			});
			await save();
			return info();
		}
		if (method === "soundPath") {
			const sound = settings.sounds.find((s) => s.id === input);
			if (!sound) throw Error("Sound not found.");
			const file = path.join(root(), sound.file);
			rememberApprovedLocalReadPath(file);
			return file;
		}
		if (method === "updateSound") {
			const next = studioSettingsSchema.parse({
				...settings,
				sounds: settings.sounds.map((s) =>
					s.id === input.id
						? { ...s, name: input.name, shortcut: input.shortcut, volume: input.volume }
						: s,
				),
			});
			bindAll(next);
			settings = next;
			await save();
			return info();
		}
		if (method === "removeSound") {
			const next = { ...settings, sounds: settings.sounds.filter((s) => s.id !== input) };
			bindAll(next);
			settings = next;
			await save();
			return info();
		}
		throw Error("Unknown studio action.");
	});
	app.on("will-quit", () => {
		for (const key of bindings) globalShortcut.unregister(key);
		clearInterval(glowTimer);
	});
}
