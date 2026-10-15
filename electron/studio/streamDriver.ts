import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { app, shell } from "electron";
import type { StreamDriverStatus } from "../../src/types/streamDriver";
import { isCursorCaptureActive } from "../ipc/state";
import { isStreaming } from "./streamAudio";

// Unmodified official distribution. Updating the version requires reviewing its
// checksum and Apple installer identity; never accept a URL from a renderer.
export const BLACKHOLE_PACKAGE = {
	version: "0.7.1",
	url: "https://existential.audio/downloads/BlackHole2ch-0.7.1.pkg",
	sha256: "57b540f27a3e29c37e310e01bee0fdfab76733087e47f997ef9dccf851400dcf",
};
const exec = promisify(execFile);
const plist = "/Library/Audio/Plug-Ins/HAL/BlackHole2ch.driver/Contents/Info.plist";
let phase: StreamDriverStatus["phase"] = "idle";
let error: string | undefined;
let pending: Promise<StreamDriverStatus> | undefined;

export async function streamDriverInfo(): Promise<StreamDriverStatus> {
	let version: string | undefined;
	if (process.platform === "darwin") {
		try {
			const result = await exec(
				"/usr/bin/plutil",
				["-extract", "CFBundleShortVersionString", "raw", plist],
				{ timeout: 5000 },
			);
			version = result.stdout.trim() || "installed";
		} catch {
			// No driver is the normal recording-only installation.
		}
	}
	return { platform: process.platform, installed: !!version, version, phase, error };
}

export function verifyDriverBytes(bytes: Uint8Array) {
	if (createHash("sha256").update(bytes).digest("hex") !== BLACKHOLE_PACKAGE.sha256)
		throw Error(
			"The BlackHole download could not be verified. Nothing was installed. Try again later.",
		);
}

async function downloadPackage() {
	const response = await fetch(BLACKHOLE_PACKAGE.url, {
		redirect: "error",
		signal: AbortSignal.timeout(90000),
	});
	const limit = 2 * 1024 * 1024;
	if (!response.ok || !response.body || Number(response.headers.get("content-length")) > limit)
		throw Error(
			"Could not download the official BlackHole installer. Check your connection and retry.",
		);
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > limit)
				throw Error(
					"The driver download exceeded its expected size. Nothing was installed.",
				);
			chunks.push(value);
		}
	} finally {
		await reader.cancel();
	}
	return Buffer.concat(chunks);
}

function requireIdle() {
	if (isCursorCaptureActive || isStreaming())
		throw Error("Stop recording and Stream mode before installing an audio driver.");
}

async function install() {
	if (process.platform !== "darwin")
		throw Error("In-app BlackHole installation is available on macOS.");
	requireIdle();
	const existing = await streamDriverInfo();
	if (existing.installed) return existing; // Never replace or downgrade an existing driver.
	let directory: string | undefined;
	try {
		error = undefined;
		phase = "downloading";
		const bytes = await downloadPackage();
		phase = "verifying";
		verifyDriverBytes(bytes);
		directory = await fs.mkdtemp(path.join(app.getPath("temp"), "mistarecorda-blackhole-"));
		await fs.chmod(directory, 0o700);
		const file = path.join(directory, `BlackHole2ch-${BLACKHOLE_PACKAGE.version}.pkg`);
		await fs.writeFile(file, bytes, { mode: 0o600 });
		const signature = await exec("/usr/sbin/pkgutil", ["--check-signature", file], {
			timeout: 30000,
			env: { ...process.env, LC_ALL: "C", LANG: "C" },
		});
		if (
			!signature.stdout.includes(
				"Developer ID Installer: Existential Audio Inc. (Q5C99V536K)",
			) ||
			!signature.stdout.includes(
				"Status: signed by a developer certificate issued by Apple for distribution",
			)
		)
			throw Error("The installer signature could not be verified. Nothing was installed.");
		requireIdle(); // Recording may have started while the download was in progress.
		const openError = await shell.openPath(file);
		if (openError) throw Error(`Could not open macOS Installer: ${openError}`);
		// Opening Installer is not proof of installation. Recheck the driver separately.
		phase = "installer-open";
		return await streamDriverInfo();
	} catch (e) {
		phase = "idle";
		error = e instanceof Error ? e.message : "Driver setup failed. Please try again.";
		if (directory) await fs.rm(directory, { recursive: true, force: true });
		throw e;
	}
}

export function installStreamDriver() {
	if (!pending)
		pending = install().finally(() => {
			pending = undefined;
		});
	return pending;
}
