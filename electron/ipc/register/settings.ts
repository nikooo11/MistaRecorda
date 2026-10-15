import { readFileSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import { app, BrowserWindow, ipcMain } from "electron";
import { hideCursor } from "../../cursorHider";
import { closeCountdownWindow, createCountdownWindow } from "../../windows";
import {
	APP_SETTINGS_FILE,
	COUNTDOWN_SETTINGS_FILE,
	RECORDINGS_SETTINGS_FILE,
	SHORTCUTS_FILE,
} from "../constants";
import { CountdownSession } from "../../countdownSession";
import { parseJsonWithByteOrderMark } from "../utils";

const BROWSER_MICROPHONE_PROFILE_ENV = "RECORDLY_BROWSER_MIC_PROFILE";
const DEFAULT_BROWSER_MICROPHONE_PROFILE = "processed";
const BROWSER_MICROPHONE_PROFILES = new Set([
	"processed",
	"no-agc",
	"no-echo",
	"no-noise-suppression",
	"raw",
]);

function getBrowserMicrophoneProfileFromEnv() {
	const requested = process.env[BROWSER_MICROPHONE_PROFILE_ENV]?.trim() || null;
	const normalized = requested?.toLowerCase() ?? DEFAULT_BROWSER_MICROPHONE_PROFILE;
	return {
		browserMicrophoneProfile: BROWSER_MICROPHONE_PROFILES.has(normalized)
			? normalized
			: DEFAULT_BROWSER_MICROPHONE_PROFILE,
		requestedBrowserMicrophoneProfile: requested,
	};
}

function readAppSettingsStore(): Record<string, unknown> {
	try {
		const content = readFileSync(APP_SETTINGS_FILE, "utf-8");
		const parsed = parseJsonWithByteOrderMark<unknown>(content);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}

		return parsed as Record<string, unknown>;
	} catch {
		return {};
	}
}

function writeAppSettingsStore(store: Record<string, unknown>) {
	writeFileSync(APP_SETTINGS_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function hasAppSetting(store: Record<string, unknown>, key: string): boolean {
	return Reflect.getOwnPropertyDescriptor(store, key) !== undefined;
}

export function registerSettingsHandlers() {
	ipcMain.handle("app:getVersion", () => {
		return app.getVersion();
	});

	ipcMain.handle("get-platform", () => {
		return process.platform;
	});

	ipcMain.on("app-settings:get", (event, key: unknown) => {
		try {
			if (typeof key !== "string" || key.length === 0) {
				event.returnValue = { success: false, value: null };
				return;
			}

			const store = readAppSettingsStore();
			event.returnValue = {
				success: true,
				value: hasAppSetting(store, key) ? store[key] : null,
			};
		} catch (error) {
			console.error("Failed to read app setting:", error);
			event.returnValue = { success: false, value: null };
		}
	});

	ipcMain.on("app-settings:set", (event, key: unknown, value: unknown) => {
		try {
			if (typeof key !== "string" || key.length === 0) {
				event.returnValue = { success: false };
				return;
			}

			const store = readAppSettingsStore();
			store[key] = value;
			writeAppSettingsStore(store);
			event.returnValue = { success: true };
		} catch (error) {
			console.error("Failed to save app setting:", error);
			event.returnValue = { success: false };
		}
	});

	// ---------------------------------------------------------------------------
	// Cursor hiding for the browser-capture fallback.
	// The IPC promise resolves only after the cursor hide attempt completes.
	// ---------------------------------------------------------------------------
	ipcMain.handle("hide-cursor", () => {
		if (process.platform !== "win32") {
			return { success: true };
		}

		return { success: hideCursor() };
	});

	ipcMain.handle("get-shortcuts", async () => {
		try {
			const data = await fs.readFile(SHORTCUTS_FILE, "utf-8");
			return parseJsonWithByteOrderMark(data);
		} catch {
			return null;
		}
	});

	ipcMain.handle("save-shortcuts", async (_, shortcuts: unknown) => {
		try {
			await fs.writeFile(SHORTCUTS_FILE, JSON.stringify(shortcuts, null, 2), "utf-8");
			return { success: true };
		} catch (error) {
			console.error("Failed to save shortcuts:", error);
			return { success: false, error: String(error) };
		}
	});

	// ---------------------------------------------------------------------------
	// Countdown timer before recording
	// ---------------------------------------------------------------------------
	ipcMain.handle("get-recording-preferences", async () => {
		try {
			const content = await fs.readFile(RECORDINGS_SETTINGS_FILE, "utf-8");
			const parsed = parseJsonWithByteOrderMark<Record<string, unknown>>(content);
			return {
				success: true,
				microphoneEnabled: parsed.microphoneEnabled !== false,
				microphoneDeviceId:
					typeof parsed.microphoneDeviceId === "string"
						? parsed.microphoneDeviceId
						: undefined,
				systemAudioEnabled: parsed.systemAudioEnabled !== false,
			};
		} catch {
			return {
				success: true,
				microphoneEnabled: true,
				microphoneDeviceId: undefined,
				systemAudioEnabled: true,
			};
		}
	});

	ipcMain.handle("get-recording-audio-lab-config", () => {
		return getBrowserMicrophoneProfileFromEnv();
	});

	ipcMain.handle(
		"set-recording-preferences",
		async (
			_,
			prefs: {
				microphoneEnabled?: boolean;
				microphoneDeviceId?: string;
				systemAudioEnabled?: boolean;
			},
		) => {
			try {
				let existing: Record<string, unknown> = {};
				try {
					const content = await fs.readFile(RECORDINGS_SETTINGS_FILE, "utf-8");
					existing = parseJsonWithByteOrderMark<Record<string, unknown>>(content);
				} catch {
					// file doesn't exist yet
				}
				const merged = { ...existing, ...prefs };
				await fs.writeFile(
					RECORDINGS_SETTINGS_FILE,
					JSON.stringify(merged, null, 2),
					"utf-8",
				);
				return { success: true };
			} catch (error) {
				console.error("Failed to save recording preferences:", error);
				return { success: false, error: String(error) };
			}
		},
	);

	ipcMain.handle("get-countdown-delay", async () => {
		try {
			const content = await fs.readFile(COUNTDOWN_SETTINGS_FILE, "utf-8");
			const parsed = parseJsonWithByteOrderMark<{ delay?: number }>(content);
			return { success: true, delay: parsed.delay ?? 3 };
		} catch {
			return { success: true, delay: 3 };
		}
	});

	ipcMain.handle("set-countdown-delay", async (_, delay: number) => {
		try {
			await fs.writeFile(
				COUNTDOWN_SETTINGS_FILE,
				JSON.stringify({ delay }, null, 2),
				"utf-8",
			);
			return { success: true };
		} catch (error) {
			console.error("Failed to save countdown delay:", error);
			return { success: false, error: String(error) };
		}
	});

	const countdown = new CountdownSession((seconds) => {
		if (seconds === null) closeCountdownWindow();
		for (const win of BrowserWindow.getAllWindows()) {
			if (!win.isDestroyed()) win.webContents.send("countdown-tick", seconds ?? 0);
		}
	});
	ipcMain.handle("start-countdown", async (_, seconds: number) => {
		if (countdown.remaining !== null)
			return { success: false, error: "Countdown already in progress" };
		if (!Number.isInteger(seconds) || seconds < 0 || seconds > 30)
			return { success: false, error: "Invalid countdown" };
		if (seconds > 0) createCountdownWindow();
		// Start immediately. The popup reads get-active-countdown when it finishes
		// loading, and Cancel can settle this gate even before that load completes.
		return countdown.start(seconds);
	});
	ipcMain.handle("cancel-countdown", () => {
		countdown.cancel();
		return { success: true };
	});
	ipcMain.handle("get-active-countdown", () => ({ success: true, seconds: countdown.remaining }));
}
