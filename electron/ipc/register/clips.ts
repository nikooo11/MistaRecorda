import fs from "node:fs/promises";
import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import { isPathInsideDirectory, rememberApprovedLocalReadPath } from "../project/manager";
import { resolveRecordingSession } from "../project/session";
import { appendRecordingClip, deleteRecordingArtifacts } from "../recording/appendClip";
import { isProtectedRecording } from "../recording/prune";
import {
	currentRecordingSession,
	currentVideoPath,
	setCurrentRecordingSession,
	setCurrentVideoPath,
} from "../state";
import type { RecordingSessionData } from "../types";
import { getRecordingsDir, isAutoRecordingPath } from "../utils";

export interface ClipWindows {
	/** Shows the recording studio and makes it the main window. */
	showRecorder(): void;
	/** Restores the editor that asked for the clip. */
	showEditor(): void;
	hideEditor(editor: BrowserWindow): void;
	closeEditor(editor: BrowserWindow): void;
}

/** The recording a new clip will be appended to, captured when the editor hands off. */
let pendingClip: { basePath: string; baseSession: RecordingSessionData | null } | null = null;

export function isClipCapturePending() {
	return Boolean(pendingClip);
}

function broadcast() {
	for (const w of BrowserWindow.getAllWindows())
		if (!w.isDestroyed()) w.webContents.send("clip-capture-changed", Boolean(pendingClip));
}

/** Only unprotected auto recordings in the recordings folder may be deleted. */
async function deletableRecording(file: string | null | undefined) {
	if (!file) return null;
	const resolved = await fs.realpath(file).catch(() => path.resolve(file));
	const dir = await getRecordingsDir();
	const root = await fs.realpath(dir).catch(() => path.resolve(dir));
	if (!isPathInsideDirectory(resolved, root) || !isAutoRecordingPath(resolved)) return null;
	if (await isProtectedRecording(resolved)) return null;
	return resolved;
}

async function deleteRecording(videoPath: string, webcamPath?: string | null) {
	const video = await deletableRecording(videoPath);
	if (!video) throw Error("Only unsaved recordings from the recordings folder can be discarded.");
	await deleteRecordingArtifacts(video);
	const webcam = await deletableRecording(webcamPath);
	if (webcam) await deleteRecordingArtifacts(webcam);
	if (
		currentVideoPath &&
		(await fs.realpath(currentVideoPath).catch(() => currentVideoPath)) === video
	) {
		setCurrentVideoPath(null);
		setCurrentRecordingSession(null);
	}
}

export function registerClipHandlers(windows: ClipWindows) {
	// The recorder signals once the take's webcam and audio sidecars are fully written.
	ipcMain.on("clip:recording-finalized", (_event, videoPath: unknown) => {
		if (typeof videoPath !== "string") return;
		for (const w of BrowserWindow.getAllWindows())
			if (!w.isDestroyed()) w.webContents.send("clip-recording-finalized", videoPath);
	});
	ipcMain.handle("clip:status", () => ({ pending: Boolean(pendingClip) }));

	ipcMain.handle("clip:record", (event) => {
		if (!currentVideoPath) throw Error("Open a recording before adding a clip.");
		pendingClip = {
			basePath: currentVideoPath,
			baseSession:
				currentRecordingSession?.videoPath === currentVideoPath
					? currentRecordingSession
					: null,
		};
		const editor = BrowserWindow.fromWebContents(event.sender);
		if (editor) windows.hideEditor(editor);
		windows.showRecorder();
		broadcast();
		return { pending: true };
	});

	ipcMain.handle("clip:cancel", () => {
		if (!pendingClip) return { pending: false };
		const { basePath, baseSession } = pendingClip;
		pendingClip = null;
		if (!currentVideoPath) {
			setCurrentVideoPath(basePath);
			setCurrentRecordingSession(baseSession);
		}
		windows.showEditor();
		broadcast();
		return { pending: false };
	});

	ipcMain.handle("clip:append", async () => {
		const pending = pendingClip;
		if (!pending) throw Error("No clip is being recorded for this project.");
		const addPath = currentVideoPath;
		if (!addPath || addPath === pending.basePath) throw Error("No new clip was recorded.");
		const addSession =
			currentRecordingSession?.videoPath === addPath
				? currentRecordingSession
				: await resolveRecordingSession(addPath);
		const result = await appendRecordingClip(
			{
				videoPath: pending.basePath,
				webcamPath: pending.baseSession?.webcamPath,
				timeOffsetMs: pending.baseSession?.timeOffsetMs,
			},
			{
				videoPath: addPath,
				webcamPath: addSession?.webcamPath,
				timeOffsetMs: addSession?.timeOffsetMs,
			},
			await getRecordingsDir(),
		);
		pendingClip = null;
		for (const file of [result.videoPath, result.webcamPath])
			if (file) await rememberApprovedLocalReadPath(file);
		setCurrentVideoPath(result.videoPath);
		setCurrentRecordingSession(null);
		// The joined recording now holds this clip; drop the separate take.
		await deleteRecording(addPath, addSession?.webcamPath).catch(() => undefined);
		broadcast();
		return {
			...result,
			basePath: pending.basePath,
			firstHadWebcam: Boolean(pending.baseSession?.webcamPath),
			second: {
				hasWebcam: Boolean(addSession?.webcamPath),
				visibility: addSession?.webcamVisibility,
				layoutCues: addSession?.webcamLayoutCues,
			},
		};
	});

	ipcMain.handle(
		"clip:discard",
		async (_event, input: { videoPath?: string; webcamPath?: string | null }) => {
			if (typeof input?.videoPath !== "string") throw Error("Choose a recording to discard.");
			await deleteRecording(input.videoPath, input.webcamPath);
			return { success: true };
		},
	);

	ipcMain.handle(
		"clip:discard-and-record",
		async (event, input: { videoPath?: string; webcamPath?: string | null }) => {
			if (typeof input?.videoPath !== "string") throw Error("Choose a recording to discard.");
			await deleteRecording(input.videoPath, input.webcamPath);
			pendingClip = null;
			setCurrentVideoPath(null);
			setCurrentRecordingSession(null);
			windows.showRecorder();
			const editor = BrowserWindow.fromWebContents(event.sender);
			if (editor) windows.closeEditor(editor);
			broadcast();
			return { success: true };
		},
	);
}
