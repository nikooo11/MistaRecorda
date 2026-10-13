import { readAudioMetadata, writeAudioMetadata } from "../recording/library";
import { resolveApprovedLocalMediaPath } from "../project/manager";
import { startVoiceJob, cancelJob, jobProgress } from "./job";
import path from "node:path";
import { app, BrowserWindow, ipcMain, safeStorage, type IpcMainInvokeEvent } from "electron";
import type { VoiceRequests, VoiceResult } from "../../../src/types/voice";
import { ElevenLabs } from "./elevenlabs";
import { VoiceSettingsStore } from "./settings";
let voiceWindow: BrowserWindow | null = null;
export function openVoiceWindow() {
	if (voiceWindow && !voiceWindow.isDestroyed()) {
		voiceWindow.show();
		voiceWindow.focus();
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
	voiceWindow.on("closed", () => {
		voiceWindow = null;
	});
	if (process.env.VITE_DEV_SERVER_URL)
		void voiceWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?windowType=voice`);
	else
		void voiceWindow.loadFile(path.join(app.getAppPath(), "dist/index.html"), {
			query: { windowType: "voice" },
		});
	return true;
}
export const voiceStore = () => new VoiceSettingsStore(app.getPath("userData"), safeStorage);
export async function voiceClient() {
	const key = await voiceStore().key();
	if (!key) throw new Error("missingKey");
	return new ElevenLabs(key);
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
				!BrowserWindow.fromWebContents(event.sender)
			)
				return { ok: false, error: "noAccess" };
			try {
				return { ok: true, data: await handler(input, event) };
			} catch (error) {
				const code = error instanceof Error ? error.message : "unknown";
				return { ok: false, error: /^[a-zA-Z]+$/.test(code) ? code : "operationFailed" };
			}
		},
	);
}
export function registerVoiceHandlers() {
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
		if (typeof input !== "string") throw new Error("invalidAudio");
		const video = await resolveApprovedLocalMediaPath(input);
		if (!video) throw new Error("noAccess");
		return startVoiceJob(video, await voiceStore().read(), await voiceClient());
	});
	voiceHandle("cancel", (input) => cancelJob(input));
	voiceHandle("progress", () => jobProgress());
	voiceHandle("getSettings", () => voiceStore().publicSettings());
	voiceHandle("saveSettings", (input) => voiceStore().save(input));
	voiceHandle("setKey", (input) => voiceStore().setKey(input));
	voiceHandle("testKey", async () => (await voiceClient()).testKey());
	voiceHandle("listVoices", async () => (await voiceClient()).voices());
	voiceHandle("open", () => openVoiceWindow());
}
