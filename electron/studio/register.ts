import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain } from "electron";
import { z } from "zod";
import {
	defaultEnvironmentAudio,
	type EnvironmentAudio,
	environmentAudioUnavailable,
} from "../../src/components/studio/environmentAudio";
import { normalizeShortcut, recorderShortcuts } from "../../src/components/studio/shortcuts";
import {
	isSelectedSource,
	sourceSwitchUnavailable,
} from "../../src/components/studio/sourceSwitching";
import type { AudioRegion } from "../../src/components/video-editor/types";
import type { StudioInfo, StudioSettings, StudioSource } from "../../src/types/studio";
import {
	assertBoardCaptureSource,
	isDrawingSurfaceWindow,
	sendRecordingControl,
} from "../board/register";
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
import { getFfmpegBinaryPath, getFfprobeBinaryPath } from "../ipc/ffmpeg/binary";
import {
	rememberApprovedLocalReadPath,
	resolveApprovedLocalMediaPath,
} from "../ipc/project/manager";
import {
	isCursorCaptureActive,
	nativeCaptureProcess,
	nativeScreenRecordingActive,
	selectedSource,
	selectedWindowBounds,
	setSelectedSource,
	setSelectedWindowBounds,
} from "../ipc/state";
import { closeHeldZoom, zoomStatus } from "../ipc/zoom/capture";
import { isZoomSettingsWindow } from "../ipc/zoom/register";
import { showCapturePanel } from "../panelToggle";
import { getPackagedRendererBaseUrl } from "../rendererServer";
import { requireScreenRecordingAccess } from "../screenCaptureAccess";
import { bakeSounds } from "./bakeSounds";
import { CaptureCamera } from "./camera";
import { focusRecordingWindow } from "./focusWindow";
import { setCaptureCanvasAspect } from "./geometry";
import {
	cameraLayoutSchema,
	SoundTake,
	shortcutSchema,
	sourceSchema,
	studioSettingsSchema,
} from "./model";
import { recorderCommand } from "./nativeCommand";
import { ownsShortcutCapture } from "./shortcutCapture";
import {
	audioEngineReply,
	isStreaming,
	startStream,
	stopStream,
	streamDevices,
	streamInfo,
	streamSound,
} from "./streamAudio";
import {
	persistVoiceCues,
	recordingVoiceList,
	selectRecordingVoice,
	startVoiceCues,
} from "./voiceCues";

const exec = promisify(execFile);
let settings: StudioSettings = studioSettingsSchema.parse({ glow: true, windows: [], sounds: [] });
let cameraSaveTimer: ReturnType<typeof setTimeout> | undefined;
const camera = new CaptureCamera(
	() => settings.cameraLayout,
	(layout) => {
		settings = { ...settings, cameraLayout: layout };
		camera.record(layout);
		publish();
		clearTimeout(cameraSaveTimer);
		cameraSaveTimer = setTimeout(
			() =>
				void save().catch((e) => {
					message = e.message;
					publish();
				}),
			250,
		);
	},
);
let panelTab: import("../../src/types/studio").StudioTab = "layers";
let message = "";
let switching = false;
let audioState: EnvironmentAudio = { ...defaultEnvironmentAudio };
let capturedAudio: EnvironmentAudio = { ...defaultEnvironmentAudio };
let audioRecording = false;
let take = new SoundTake();
let includeSounds = true;
let persistedTake: Promise<void> | undefined;
let savedPath: string | null = null;
let panel: BrowserWindow | undefined;
let shortcutCaptureOwner: Electron.WebContents | undefined;
let shortcutCaptureTimer: ReturnType<typeof setTimeout> | undefined;
let shortcutCaptureCleanup: (() => void) | undefined;
function endShortcutCapture() {
	clearTimeout(shortcutCaptureTimer);
	shortcutCaptureCleanup?.();
	shortcutCaptureCleanup = undefined;
	shortcutCaptureOwner = undefined;
	globalShortcut.setSuspended(false);
}
let glow: BrowserWindow | undefined;
let glowPulse = false;
let glowTimer: ReturnType<typeof setInterval> | undefined;
const bindings = new Set<string>();
const root = () => path.join(app.getPath("userData"), "studio");
const info = (): StudioInfo => ({
	settings,
	camera: camera.status,
	panelTab,
	recording: isCursorCaptureActive,
	switching,
	canSwitch: process.platform === "darwin",
	selectedName: selectedSource?.name ?? "Choose a source",
	selectedSource: selectedSource?.id
		? {
				...selectedSource,
				id: selectedSource.id,
				sourceType: selectedSource.id.startsWith("window:") ? "window" : "screen",
			}
		: undefined,
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
export async function fireSound(id: string) {
	const sound = settings.sounds.find((s) => s.id === id);
	if (!sound) throw Error("Sound not found.");
	if (isStreaming()) {
		await streamSound(path.join(root(), sound.file), sound.volume);
		return;
	}
	if (!isCursorCaptureActive) {
		if (process.platform !== "darwin") throw Error("Use Preview to listen before recording.");
		void exec("/usr/bin/afplay", [
			"-v",
			String(sound.volume),
			path.join(root(), sound.file),
		]).catch((e) => {
			message = e.message;
			publish();
		});
		message = `Playing ${sound.name} on the Mac`;
		publish();
		return;
	}
	if (isCursorCapturePaused()) throw Error("Resume recording before adding a sound.");
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
		const region = take.regions[take.regions.length - 1];
		if (process.platform === "darwin" && nativeCaptureProcess) {
			const token = crypto.randomUUID();
			try {
				await recorderCommand(
					`sound ${Buffer.from(JSON.stringify({ token, path: region.audioPath, volume: sound.volume })).toString("base64")}`,
					`SOUND_PLAYING ${token}`,
					`SOUND_FAILED ${token}`,
				);
			} catch (e) {
				take.regions = take.regions.filter((r) => r !== region);
				throw e;
			}
		}
		message = `${sound.name} ${includeSounds ? "included in recording" : "added as an editable clip"}`;
		publish();
	}
}
export function boardSoundList() {
	return {
		streaming: isStreaming(),
		recording: isCursorCaptureActive,
		paused: isCursorCapturePaused(),
		includeSoundboardInRecording: settings.includeSoundboardInRecording !== false,
		sounds: [...settings.sounds]
			.sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite))
			.map(({ file: _file, ...sound }) => sound),
	};
}
export async function boardSoundPreview(id: string) {
	if (isCursorCaptureActive)
		throw Error("Preview is available before recording. Use Add to take while recording.");
	const sound = settings.sounds.find((s) => s.id === id);
	if (!sound) throw Error("Sound not found.");
	return {
		dataURL: `data:audio/wav;base64,${(await fs.readFile(path.join(root(), sound.file))).toString("base64")}`,
		volume: Math.min(1, sound.volume),
	};
}
function bindAll(next: StudioSettings) {
	const desired = [
		{ shortcut: next.cameraShortcut, run: () => void sendRecordingControl("webcam") },
		...next.scenes.map((scene) => ({
			shortcut: scene.shortcut,
			run: () =>
				void applyScene(scene.id).catch((e) => {
					message = e.message;
					publish();
				}),
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
				void fireSound(s.id).catch((e) => {
					message = String((e as Error).message);
					publish();
				});
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
		if (
			keys.includes(
				normalizeShortcut(
					fixed.shortcut,
					process.platform === "darwin"
						? "darwin"
						: process.platform === "win32"
							? "win32"
							: "linux",
				),
			)
		)
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
	const targetAudio = scene.audio ?? audioState;
	const changesAudio =
		targetAudio.microphone !== audioState.microphone ||
		targetAudio.system !== audioState.system;
	if (isCursorCaptureActive && changesAudio) {
		const unavailable = environmentAudioUnavailable(
			targetAudio,
			capturedAudio,
			nativeScreenRecordingActive && !nativeCaptureProcess,
		);
		if (unavailable) throw Error(unavailable);
	}
	let focusWarning = "";
	if (isCursorCaptureActive) {
		// Never change the camera if the source switch fails.
		if (scene.source.id !== selectedSource?.id) {
			if (scene.source.sourceType !== "window" || !selectedSource?.id?.startsWith("window:"))
				throw Error(
					"Stop recording to switch displays. Window scenes can switch during a window recording.",
				);
			focusWarning = (await switchWindow(scene.source)) ?? "";
		} else if (scene.source.sourceType === "window") {
			// Recalling the current environment should also restore desktop focus.
			focusWarning = (await switchWindow(scene.source)) ?? "";
		}
	} else if (process.platform === "darwin" && scene.source.sourceType === "window") {
		await switchWindow(scene.source);
	} else {
		requireScreenRecordingAccess();
		const sources = await desktopCapturer.getSources({
			types: [scene.source.sourceType],
			thumbnailSize: { width: 0, height: 0 },
		});
		const source = sources.find((s) =>
			scene.source.sourceType === "screen" && scene.source.display_id
				? s.display_id === scene.source.display_id
				: s.id === scene.source.id,
		);
		if (!source)
			throw Error(
				"This scene’s source is unavailable. Edit the scene and choose an open source.",
			);
		const next = { ...scene.source, id: source.id };
		assertBoardCaptureSource(next);
		setSelectedSource(next);
		for (const w of BrowserWindow.getAllWindows())
			w.webContents.send("selected-source-changed", next);
	}
	if (scene.cameraLayout) {
		settings = { ...settings, cameraLayout: scene.cameraLayout };
		camera.record(scene.cameraLayout);
		camera.sync();
		await save();
	}
	if (scene.audio) {
		if (isCursorCaptureActive && nativeCaptureProcess?.stdin.writable)
			nativeCaptureProcess.stdin.write(
				`audio ${targetAudio.microphone ? "on" : "off"} ${targetAudio.system ? "on" : "off"}\n`,
			);
		await sendRecordingControl(targetAudio.microphone ? "microphone-on" : "microphone-off");
		await sendRecordingControl(targetAudio.system ? "system-audio-on" : "system-audio-off");
		audioState = { ...targetAudio };
	}
	sendRecordingControl(scene.camera ? "webcam-on" : "webcam-off");
	message = `Scene: ${scene.name}${focusWarning ? `. ${focusWarning}` : ""}`;
	publish();
}
export async function switchWindow(input: StudioSource) {
	if (switching) throw Error("A source switch is already in progress.");
	const target = sourceSchema.parse(input);
	const unavailable = sourceSwitchUnavailable(info(), target);
	if (unavailable) throw Error(unavailable);
	if (
		isCursorCaptureActive &&
		target.sourceType === "screen" &&
		isSelectedSource(target, info().selectedSource)
	)
		return;
	assertBoardCaptureSource(target);
	switching = true;
	publish();
	try {
		// Displays and non-native window sources can be recalled before a take.
		if (target.sourceType === "screen" || process.platform !== "darwin") {
			requireScreenRecordingAccess();
			const sources = await desktopCapturer.getSources({
				types: [target.sourceType],
				thumbnailSize: { width: 0, height: 0 },
			});
			const found = sources.find((source) =>
				target.sourceType === "screen" && target.display_id
					? source.display_id === target.display_id
					: source.id === target.id,
			);
			if (!found) throw Error("That source is unavailable. Reassign it in Capture settings.");
			const next = { ...target, id: found.id, name: found.name || target.name };
			setSelectedSource(next);
			setSelectedWindowBounds(null);
			for (const w of BrowserWindow.getAllWindows())
				w.webContents.send("selected-source-changed", next);
			message = `Recording source: ${next.name}`;
			return;
		}
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
		if (isCursorCaptureActive && next.id !== selectedSource?.id) {
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
		glowPulse = isCursorCaptureActive;
		await startWindowBoundsCapture();
		setSelectedWindowBounds(bounds);
		for (const w of BrowserWindow.getAllWindows())
			w.webContents.send("selected-source-changed", next);
		message = `Recording source: ${next.name}`;
		// Activate only after the recorder confirms the new source. Use the fresh
		// native ID, never the app name (which could raise another Chrome window).
		const focusWarning = isCursorCaptureActive ? await focusRecordingWindow(next.id) : "";
		if (focusWarning) message += `. ${focusWarning}`;
		return focusWarning;
	} finally {
		switching = false;
		publish();
	}
}
export function startStudioTake() {
	startVoiceCues();
	camera.start();
	setCaptureCanvasAspect(
		process.platform === "darwin" &&
			nativeScreenRecordingActive &&
			selectedSource?.id?.startsWith("window:") &&
			selectedWindowBounds
			? selectedWindowBounds.width / selectedWindowBounds.height
			: null,
	);
	take = new SoundTake();
	includeSounds = settings.includeSoundboardInRecording !== false;
	persistedTake = undefined;
	savedPath = null;
	message = "";
	clearInterval(glowTimer);
	glowPulse = true;
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
		if (glowPulse) {
			glowPulse = false;
			void glow.webContents
				.executeJavaScript(
					"document.querySelector('div').animate([{boxShadow:'0 0 10px 4px #8ae6caaa',borderColor:'#c7ffeb'},{boxShadow:'0 0 4px 2px #70d1b033',borderColor:'#9ce4ce88'}],{duration:800,easing:'ease-out'})",
				)
				.catch(() => {
					/* A closing glow window must not interrupt capture. */
				});
		}
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
	if (persistedTake) return persistedTake;
	persistedTake = persistSounds(videoPath);
	return persistedTake;
}
async function persistSounds(videoPath: string) {
	await persistVoiceCues(videoPath);
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
	if (includeSounds) {
		try {
			await bakeSounds(videoPath, take.regions);
		} catch (error) {
			// Keep the copied clips available if final mixing fails. Never discard sound cues.
			message = "Sound mixing failed. Your sounds were kept as editable clips in the editor.";
			console.error(message, error);
			publish();
		}
	}
}
export async function prepareStudioCapture() {
	if (isStreaming()) await stopStream();
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
		if (w !== glow && w !== camera.window && !isDrawingSurfaceWindow(w) && kind !== "countdown")
			w.hide();
		if (process.platform === "win32" && !isDrawingSurfaceWindow(w))
			w.setContentProtection(true);
	}
}
async function openPanel() {
	if (panel && !panel.isDestroyed()) {
		showCapturePanel(panel, BrowserWindow.getAllWindows());
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
	showCapturePanel(panel, BrowserWindow.getAllWindows());
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
				if (!ownsShortcutCapture(panel, e.sender) && !isZoomSettingsWindow(e.sender))
					throw Error("Open Capture or Zoom settings to edit shortcuts.");
				shortcutCaptureCleanup?.();
				shortcutCaptureOwner = e.sender;
				e.sender.setIgnoreMenuShortcuts(true);
				const ownerWindow = BrowserWindow.fromWebContents(e.sender);
				ownerWindow?.once("blur", endShortcutCapture);
				e.sender.once("destroyed", endShortcutCapture);
				shortcutCaptureCleanup = () => {
					ownerWindow?.removeListener("blur", endShortcutCapture);
					e.sender.removeListener("destroyed", endShortcutCapture);
					if (!e.sender.isDestroyed()) e.sender.setIgnoreMenuShortcuts(false);
				};
				globalShortcut.setSuspended(true);
				clearTimeout(shortcutCaptureTimer);
				shortcutCaptureTimer = setTimeout(endShortcutCapture, 60000);
			} else if (shortcutCaptureOwner === e.sender) endShortcutCapture();
			return info();
		}
		if (method === "panelTab") {
			panelTab = z.enum(["windows", "sounds", "controls", "scenes", "layers"]).parse(input);
			publish();
			return info();
		}
		if (method.startsWith("audioEngine")) return audioEngineReply(e.sender, method, input);
		if (method === "streamInfo") return streamInfo();
		if (method === "streamDevices") return streamDevices();
		if (method === "streamStart") return startStream(input);
		if (method === "streamStop") return stopStream();
		if (method === "info") return info();
		if (method === "recordingVoices") return recordingVoiceList(input === true);
		if (method === "selectRecordingVoice")
			return selectRecordingVoice(z.string().max(100).parse(input));
		if (method === "audioStatus") {
			const next = z
				.object({ recording: z.boolean(), microphone: z.boolean(), system: z.boolean() })
				.parse(input);
			if (next.recording && !audioRecording)
				capturedAudio = { microphone: next.microphone, system: next.system };
			audioRecording = next.recording;
			audioState = { microphone: next.microphone, system: next.system };
			return info();
		}
		if (method === "cameraStatus") {
			if (!e.sender.getURL().includes("windowType=hud-overlay"))
				throw Error("Camera status is owned by the recorder.");
			await camera.update({
				enabled: input?.enabled === true,
				deviceId: typeof input?.deviceId === "string" ? input.deviceId : undefined,
				preview: input?.preview !== false,
			});
			publish();
			return info();
		}
		if (method === "cameraError") {
			camera.status.error = String(input).slice(0, 300);
			publish();
			return info();
		}
		if (method === "cameraLayout") {
			const layout = cameraLayoutSchema.parse(input);
			settings = { ...settings, cameraLayout: layout };
			camera.record(layout);
			camera.sync();
			await save();
			return info();
		}
		if (method === "cameraTake") return camera.cues;
		if (method === "cameraToggle") {
			sendRecordingControl(camera.status.enabled ? "webcam-off" : "webcam-on");
			return info();
		}
		if (method === "prepareCapture") {
			await prepareStudioCapture();
			return info();
		}
		if (
			method === "togglePanel" &&
			panel &&
			!panel.isDestroyed() &&
			panel.isVisible() &&
			(!input || input === panelTab)
		) {
			panel.hide();
			return info();
		}
		if (method === "open" || method === "togglePanel") {
			if (["windows", "sounds", "controls", "scenes", "layers"].includes(input))
				panelTab = input;
			await openPanel();
			publish();
			return info();
		}
		if (method === "fireSound") {
			await fireSound(String(input));
			return info();
		}
		if (method === "renameSource") {
			const source = sourceSchema.parse(input?.source);
			const name = z.string().trim().max(80).parse(input?.name);
			const aliases = (settings.sourceAliases ?? []).filter(
				(entry) => !isSelectedSource(entry.source, source),
			);
			settings = studioSettingsSchema.parse({
				...settings,
				sourceAliases: name ? [...aliases, { source, name }] : aliases,
			});
			await save();
			return info();
		}
		if (method === "selectSource") {
			await switchWindow(input);
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
		if (method === "includeSoundboardInRecording") {
			settings.includeSoundboardInRecording = z.boolean().parse(input);
			await save();
			return info();
		}
		if (method === "cameraShortcut" || method === "saveScene" || method === "removeScene") {
			const next = studioSettingsSchema.parse({
				...settings,
				...(method === "cameraShortcut" ? { cameraShortcut: input } : {}),
				...(method === "saveScene"
					? { scenes: [...settings.scenes.filter((s) => s.id !== input?.id), input] }
					: {}),
				...(method === "removeScene"
					? { scenes: settings.scenes.filter((s) => s.id !== input) }
					: {}),
			});
			bindAll(next);
			settings = next;
			await save();
			return info();
		}
		if (method === "assignWindow") {
			const slot = Number(input?.slot);
			if (!Number.isInteger(slot) || slot < 1 || slot > 64)
				throw Error("Invalid window slot.");
			const source = sourceSchema.parse(input.source);
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
			if (settings.sounds.length >= 200) throw Error("You can keep up to 200 sounds.");
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
				favorite: false,
				color: "#466784",
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
						? {
								...s,
								name: input.name,
								shortcut: input.shortcut,
								volume: input.volume,
								favorite: input.favorite ?? s.favorite,
								color: input.color ?? s.color,
							}
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
		clearTimeout(cameraSaveTimer);
		camera.destroy();
	});
}

/** Only the independent camera window may request its local camera preview. */
export function isCameraPreviewWebContents(contents: Electron.WebContents | null): boolean {
	return Boolean(
		contents &&
			camera.window &&
			!camera.window.isDestroyed() &&
			camera.window.webContents === contents,
	);
}
