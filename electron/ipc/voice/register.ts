import { ffmpeg } from "./chunker";
import { prepareRecordingAudio, recordingBase } from "../recording/library";
import { pathToFileURL } from "node:url";
import { getPackagedRendererBaseUrl } from "../../rendererServer";
import { registerPresetHandlers, synchronizeFavoriteVoice } from "./presetHandlers";
import fs from "node:fs/promises";
import { shell } from "electron";
import { getRecordingsDir } from "../utils";
import { readAudioMetadata, writeAudioMetadata } from "../recording/library";
import { resolveApprovedLocalMediaPath } from "../project/manager";
import { startVoiceJob, cancelJob, jobProgress } from "./job";
import path from "node:path";
import { app, BrowserWindow, ipcMain, safeStorage, type IpcMainInvokeEvent } from "electron";
import type { VoiceRequests, VoiceResult } from "../../../src/types/voice";
import { ElevenLabs } from "./elevenlabs";
import { VoiceSettingsStore, validateSettings } from "./settings";
let voiceWindow: BrowserWindow | null = null;
let startupSelection: Promise<void> = Promise.resolve();
export function openVoiceWindow(importRequested = false) {
	if (voiceWindow && !voiceWindow.isDestroyed()) {
		voiceWindow.show();
		voiceWindow.focus();
		if (importRequested) voiceWindow.webContents.send("voice:importRequested");
		return true;
	}
	voiceWindow = new BrowserWindow({
		width: 1000,
		height: 760,
		title: "MistaRecorda — Voice Change",
		webPreferences: {
			preload: path.join(app.getAppPath(), "dist-electron/preload.mjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	voiceWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	voiceWindow.webContents.on("will-navigate", (event) => event.preventDefault());
	voiceWindow.on("closed", () => {
		voiceWindow = null;
	});
	if (process.env.VITE_DEV_SERVER_URL)
		void voiceWindow.loadURL(
			`${process.env.VITE_DEV_SERVER_URL}?windowType=voice${importRequested ? "&importPreset=1" : ""}`,
		);
	else if (getPackagedRendererBaseUrl())
		void voiceWindow.loadURL(
			`${getPackagedRendererBaseUrl()}?windowType=voice${importRequested ? "&importPreset=1" : ""}`,
		);
	else
		void voiceWindow.loadFile(path.join(app.getAppPath(), "dist/index.html"), {
			query: { windowType: "voice", ...(importRequested ? { importPreset: "1" } : {}) },
		});
	return true;
}
export function notifyVoiceSettings() {
	for (const win of BrowserWindow.getAllWindows())
		if (!win.isDestroyed()) win.webContents.send("voice:settingsChanged");
}
export const voiceStore = () => new VoiceSettingsStore(app.getPath("userData"), safeStorage);
export async function voiceClient() {
	const key = await voiceStore().key();
	if (!key) throw new Error("missingKey");
	return new ElevenLabs(key);
}
function isTrustedVoiceDocument(value: string) {
	try {
		const url = new URL(value);
		url.search = "";
		url.hash = "";
		const expected = [
			process.env.VITE_DEV_SERVER_URL,
			getPackagedRendererBaseUrl(),
			pathToFileURL(path.join(app.getAppPath(), "dist/index.html")).href,
		].filter((x): x is string => Boolean(x));
		return expected.some((base) => {
			const u = new URL(base);
			return (
				url.href === u.href ||
				(url.origin !== "null" &&
					url.origin === u.origin &&
					["/", "/index.html"].includes(url.pathname))
			);
		});
	} catch {
		return false;
	}
}
export function voiceHandle<K extends keyof VoiceRequests>(
	method: K,
	handler: (
		input: VoiceRequests[K]["input"],
		event: IpcMainInvokeEvent,
	) => Promise<VoiceRequests[K]["output"]> | VoiceRequests[K]["output"],
) {
	ipcMain.handle(
		`voice:${method}`,
		async (event, input): Promise<VoiceResult<VoiceRequests[K]["output"]>> => {
			if (
				event.senderFrame !== event.sender.mainFrame ||
				!BrowserWindow.fromWebContents(event.sender) ||
				!isTrustedVoiceDocument(event.senderFrame?.url ?? "")
			)
				return { ok: false, error: "noAccess" };
			try {
				await startupSelection;
				return { ok: true, data: await handler(input, event) };
			} catch (error) {
				const code = error instanceof Error ? error.message : "unknown";
				return { ok: false, error: /^[a-zA-Z]+$/.test(code) ? code : "operationFailed" };
			}
		},
	);
}
export function registerVoiceHandlers() {
	startupSelection = synchronizeFavoriteVoice().catch(() => undefined);
	registerPresetHandlers();
	voiceHandle("storeBrowserAudio", async (input) => {
		if (
			!input ||
			!["mic", "system"].includes(input.kind) ||
			!(input.bytes instanceof ArrayBuffer) ||
			input.bytes.byteLength > 1024 * 1024 * 1024 ||
			!Number.isFinite(input.offsetMs) ||
			input.offsetMs < 0
		)
			throw new Error("invalidAudio");
		const video = await resolveApprovedLocalMediaPath(input.videoPath);
		if (!video) throw new Error("noAccess");
		const temp = await fs.mkdtemp(path.join(app.getPath("temp"), "mistarecorda-sidecar-"));
		try {
			const source = path.join(temp, "input");
			const output = path.join(temp, "output.wav");
			await fs.writeFile(source, Buffer.from(input.bytes));
			await ffmpeg([
				"-i",
				source,
				"-vn",
				"-ac",
				input.kind === "mic" ? "1" : "2",
				"-ar",
				"48000",
				"-af",
				input.kind === "mic"
					? "asetpts=PTS-STARTPTS"
					: `adelay=${Math.round(input.offsetMs)}:all=1`,
				"-c:a",
				"pcm_s16le",
				output,
			]);
			await fs.copyFile(output, `${recordingBase(video)}.${input.kind}.wav`, 1);
			await prepareRecordingAudio(video, input.kind === "mic" ? input.offsetMs : undefined);
			return true;
		} finally {
			await fs.rm(temp, { recursive: true, force: true });
		}
	});
	voiceHandle("recordings", async () => {
		const dir = await getRecordingsDir();
		const names = await fs.readdir(dir).catch(() => []);
		const records = await Promise.all(
			names
				.filter((n) => /^recording-\d+\.(mp4|webm)$/.test(n))
				.sort()
				.reverse()
				.map((n) => readAudioMetadata(path.join(dir, n))),
		);
		return records.filter((r): r is NonNullable<typeof r> => Boolean(r));
	});
	voiceHandle("afterRecording", async (input) => {
		const p = typeof input === "string" ? await resolveApprovedLocalMediaPath(input) : null;
		if (!p) throw new Error("noAccess");
		// Recording completion only refreshes local controls. Processing requires a click.
		for (const w of BrowserWindow.getAllWindows())
			if (!w.isDestroyed()) w.webContents.send("voice:audioChanged", p);
		return null;
	});
	voiceHandle("outputAction", async (input) => {
		if (!input || !["open", "reveal"].includes(input.action))
			throw new Error("invalidSettings");
		const p = await resolveApprovedLocalMediaPath(input.videoPath);
		if (!p) throw new Error("noAccess");
		const m = await readAudioMetadata(p);
		if (!m?.voiceVideoPath) throw new Error("missingMic");
		if (input.action === "reveal") shell.showItemInFolder(m.voiceVideoPath);
		else {
			const error = await shell.openPath(m.voiceVideoPath);
			if (error) throw new Error("operationFailed");
		}
		return true;
	});
	voiceHandle("recording", async (input) => {
		const p = typeof input === "string" ? await resolveApprovedLocalMediaPath(input) : null;
		if (!p) throw new Error("noAccess");
		return readAudioMetadata(p);
	});
	voiceHandle("selectMic", async (input) => {
		if (!input || !["original", "changed"].includes(input.selection))
			throw new Error("invalidSettings");
		const p = await resolveApprovedLocalMediaPath(input.videoPath);
		if (!p) throw new Error("noAccess");
		const meta = await readAudioMetadata(p);
		if (!meta || (input.selection === "changed" && !meta.changedMicPath))
			throw new Error("missingMic");
		await writeAudioMetadata({ ...meta, micSelection: input.selection });
		for (const w of BrowserWindow.getAllWindows()) w.webContents.send("voice:audioChanged", p);
		return true;
	});
	voiceHandle("start", async (input) => {
		const source = typeof input === "string" ? input : input?.videoPath;
		if (typeof source !== "string") throw new Error("invalidAudio");
		const video = await resolveApprovedLocalMediaPath(source);
		if (!video) throw new Error("noAccess");
		const settings =
			typeof input === "string"
				? await voiceStore().read()
				: validateSettings(input.settings);
		const client = await voiceClient();
		if (!["eleven_multilingual_sts_v2", "eleven_english_sts_v2"].includes(settings.modelId)) {
			const models = await client.models();
			if (!models.some((m) => m.modelId === settings.modelId && m.canConvert))
				throw new Error("modelAccessDenied");
		}
		return startVoiceJob(video, settings, client);
	});
	voiceHandle("cancel", (input) => cancelJob(input));
	voiceHandle("progress", () => jobProgress());
	voiceHandle("getSettings", () => voiceStore().publicSettings());
	voiceHandle("saveSettings", async (input) => {
		const result = await voiceStore().save(input);
		notifyVoiceSettings();
		return result;
	});
	voiceHandle("setKey", async (input) => {
		const result = await voiceStore().setKey(input);
		notifyVoiceSettings();
		return result;
	});
	voiceHandle("testKey", async () => (await voiceClient()).testKey());
	voiceHandle("models", async () => (await voiceClient()).models());
	voiceHandle("chooseVoice", async (input) => {
		if (
			!input ||
			[input.voiceId, input.name].some(
				(v) => typeof v !== "string" || !v || v.length > 256,
			) ||
			(input.publicOwnerId != null &&
				(typeof input.publicOwnerId !== "string" || input.publicOwnerId.length > 256))
		)
			throw new Error("invalidSettings");
		const api = await voiceClient();
		let id = input.voiceId;
		if (input.publicOwnerId && !(await api.voices()).some((v) => v.voiceId === id)) {
			const added = await api.addLibraryVoice(input.publicOwnerId, id, input.name);
			if (typeof added?.voice_id === "string") id = added.voice_id;
		}
		const voice = await api.getVoice(id);
		const result = await voiceStore().save({
			...(await voiceStore().read()),
			voiceId: id,
			voiceName: voice.name,
		});
		notifyVoiceSettings();
		return result;
	});
	voiceHandle("listVoices", async () => (await voiceClient()).voices());
	voiceHandle("open", () => openVoiceWindow());
}
