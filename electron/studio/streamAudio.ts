import { protectAppWindow } from "./captureVisibility";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow } from "electron";
import { z } from "zod";
import type { StreamRouting, StreamStatus } from "../../src/types/streamAudio";
import { isCursorCaptureActive } from "../ipc/state";
import { getPackagedRendererBaseUrl } from "../rendererServer";

let engine: BrowserWindow | undefined;
let ready: Promise<void> | undefined;
let markReady: (() => void) | undefined;
let active = false;
let label = "";
let routing: StreamRouting | undefined;
const pending = new Map<
	string,
	{
		resolve: (value: unknown) => void;
		reject: (e: Error) => void;
		timer: ReturnType<typeof setTimeout>;
	}
>();
const routingSchema = z.object({
	input: z.string().min(1).max(500),
	output: z.string().min(1).max(500),
	monitor: z.string().max(500),
	outputLabel: z.string().max(200),
	inputLabel: z.string().max(200),
	virtualOutputConfirmed: z.literal(true),
});
const configPath = () => path.join(app.getPath("userData"), "studio", "stream-routing.json");
export function isStreamAudioWebContents(contents: Electron.WebContents | null) {
	return !!contents && engine?.webContents === contents;
}
function reset() {
	active = false;
	ready = undefined;
	for (const p of pending.values()) {
		clearTimeout(p.timer);
		p.reject(Error("Audio engine closed."));
	}
	pending.clear();
}
async function prepare() {
	if (ready) return ready;
	engine = new BrowserWindow({
		title: "MistaRecorda Audio Engine",
		show: false,
		width: 1,
		height: 1,
		skipTaskbar: true,
		webPreferences: {
			preload: path.join(app.getAppPath(), "dist-electron/preload.mjs"),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			backgroundThrottling: false,
		},
	});
	protectAppWindow(engine);
	engine.on("closed", reset);
	engine.webContents.on("render-process-gone", reset);
	ready = new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			ready = undefined;
			reject(Error("Audio engine did not start."));
			engine?.destroy();
		}, 15000);
		markReady = () => {
			clearTimeout(timer);
			resolve();
		};
	});
	const base =
		process.env.VITE_DEV_SERVER_URL ||
		getPackagedRendererBaseUrl() ||
		pathToFileURL(path.join(app.getAppPath(), "dist/index.html")).href;
	void engine.loadURL(`${base}?windowType=studio-audio`).catch(() => engine?.destroy());
	return ready;
}
async function command<T>(method: string, input?: unknown): Promise<T> {
	await prepare();
	return new Promise<T>((resolve, reject) => {
		const id = crypto.randomUUID();
		const timer = setTimeout(() => {
			pending.delete(id);
			reject(Error("Audio action timed out."));
			// A late microphone permission response must not start an unreported stream.
			if (method === "start" || method === "devices") engine?.destroy();
		}, 30000);
		pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
		engine!.webContents.send("studio:audio", { id, method, input });
	});
}
export function audioEngineReply(sender: Electron.WebContents, method: string, input: unknown) {
	if (!isStreamAudioWebContents(sender))
		throw Error("Only the audio engine may report audio state.");
	if (method === "audioEngineReady") {
		markReady?.();
		markReady = undefined;
		return;
	}
	if (method === "audioEngineEnded") {
		active = false;
		return;
	}
	const reply = z
		.object({
			id: z.string().uuid(),
			error: z.string().optional(),
			result: z.unknown().optional(),
		})
		.parse(input);
	const p = pending.get(reply.id);
	if (!p) return;
	pending.delete(reply.id);
	clearTimeout(p.timer);
	if (reply.error) p.reject(Error(reply.error.slice(0, 500)));
	else p.resolve(reply.result);
}
export async function streamInfo(): Promise<StreamStatus> {
	if (!routing) {
		try {
			routing = routingSchema.parse(JSON.parse(await fs.readFile(configPath(), "utf8")));
		} catch {
			/* First use or removed device configuration: ask for fresh choices. */
		}
	}
	return { active, outputLabel: active ? label : "", routing };
}
export async function streamDevices() {
	return command("devices");
}
export async function startStream(input: unknown) {
	if (isCursorCaptureActive) throw Error("Stop recording before starting Stream mode.");
	const next = routingSchema.parse(input);
	if (
		next.output === "default" ||
		next.output === "communications" ||
		next.output === next.monitor
	)
		throw Error("Choose a dedicated virtual output, separate from your headphones.");
	active = false;
	try {
		await command("start", next);
		await fs.mkdir(path.dirname(configPath()), { recursive: true });
		await fs.writeFile(configPath(), JSON.stringify(next), { mode: 0o600 });
		active = true;
		label = next.outputLabel;
		routing = next;
	} catch (error) {
		engine?.destroy();
		throw error;
	}
	return streamInfo();
}
export async function stopStream() {
	try {
		if (ready) await command("stop");
	} catch (e) {
		engine?.destroy();
		throw e;
	} finally {
		active = false;
	}
	return streamInfo();
}
export function isStreaming() {
	return active;
}
export async function streamSound(file: string, volume: number) {
	if (!active) throw Error("Start Stream mode first.");
	await command("sound", { data: (await fs.readFile(file)).toString("base64"), volume });
}
