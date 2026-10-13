import fs from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import { watch, type FSWatcher } from "chokidar";
import { migratePreset } from "../../../src/types/voicePreset";
import { defaultVoiceSettings } from "../../../src/types/voice";
import { convertMicrophone } from "./job";
import {
	PresetStore,
	decodePreset,
	encodePreset,
	packPresets,
	unpackPresets,
	resolvePresetAccess,
} from "./presets";
import { notifyVoiceSettings, voiceClient, voiceHandle, voiceStore } from "./register";
import { validateSettings } from "./settings";
import { selectSingleFavorite } from "./favoriteSelection";
const store = () => new PresetStore(path.join(app.getPath("userData"), "presets"));
export async function synchronizeFavoriteVoice(hint?: { voiceId: string; name?: string }) {
	await selectSingleFavorite(voiceStore(), store(), hint);
	notifyVoiceSettings();
}
let watcher: FSWatcher | undefined;
let watcherQueue = Promise.resolve();
function notify() {
	for (const win of BrowserWindow.getAllWindows())
		if (!win.isDestroyed()) win.webContents.send("voice:presetsChanged");
}
export async function watchTeamFolder(folder: string) {
	await watcher?.close();
	watcher = undefined;
	if (!folder) return;
	// The main-process folder picker authorizes the location; only preset JSON is read.
	watcher = watch(folder, {
		depth: 0,
		ignoreInitial: true,
		awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
		followSymlinks: false,
	});
	watcher.on("all", (_event, file) => {
		if (!file.endsWith(".mpvoice.json")) return;
		watcherQueue = watcherQueue
			.then(async () => {
				await store().mergeTeam(folder);
				notify();
			})
			.catch(() => {
				notify();
			});
	});
	watcher.on("error", () => notify());
}
async function samples() {
	const result = await dialog.showOpenDialog({
		properties: ["openFile", "multiSelections"],
		filters: [{ name: "Audio samples", extensions: ["wav", "mp3", "m4a", "flac"] }],
	});
	if (result.canceled) return [];
	if (result.filePaths.length > 10) throw new Error("invalidSamples");
	let total = 0;
	return Promise.all(
		result.filePaths.map(async (file) => {
			const size = (await fs.stat(file)).size;
			total += size;
			if (size > 25 * 1024 * 1024 || total > 50 * 1024 * 1024)
				throw new Error("invalidSamples");
			return {
				name: path.basename(file).replace(/[^a-zA-Z0-9._-]/g, "_"),
				bytes: new Uint8Array(await fs.readFile(file)),
			};
		}),
	);
}
export function registerPresetHandlers() {
	void voiceStore()
		.read()
		.then((s) => watchTeamFolder(s.teamFolder))
		.catch(() => notify());
	app.on("before-quit", () => {
		void watcher?.close();
	});
	voiceHandle("browse", async (input) => {
		if (!input || !["mine", "library", "favorites"].includes(input.tab))
			throw new Error("invalidSettings");
		const api = await voiceClient();
		if (input.tab === "library") return api.library(input);
		if (input.tab === "favorites") {
			const ids = await store().favorites();
			return (await Promise.all(ids.map((id) => api.getVoice(id).catch(() => null)))).filter(
				(v): v is NonNullable<typeof v> => Boolean(v),
			);
		}
		return (await api.voices()).filter(
			(v) => !input.search || v.name.toLowerCase().includes(input.search.toLowerCase()),
		);
	});
	voiceHandle("favorites", () => store().favorites());
	voiceHandle("favorite", async (input) => {
		if (
			input.name !== undefined &&
			(typeof input.name !== "string" || input.name.length > 4096)
		)
			throw new Error("invalidSettings");
		const ids = await store().favorite(input.voiceId, input.enabled);
		await synchronizeFavoriteVoice(input);
		notify();
		return ids;
	});
	voiceHandle("addVoice", async (input) => {
		if (
			!input ||
			[input.owner, input.voiceId, input.name].some(
				(x) => typeof x !== "string" || !x || x.length > 256,
			)
		)
			throw new Error("invalidSettings");
		await (await voiceClient()).addLibraryVoice(input.owner, input.voiceId, input.name);
		return true;
	});
	voiceHandle("presets", async () => store().entries((await voiceStore().read()).teamFolder));
	voiceHandle("savePreset", async (input) => {
		const p = await store().save(input);
		if (p.isFavorite) await store().favorite(p.voice.voiceId, true);
		await synchronizeFavoriteVoice();
		notify();
		return p;
	});
	voiceHandle("deletePreset", async (input) => {
		const result = await store().remove(input);
		notify();
		return result;
	});
	voiceHandle("usePreset", async (input) => {
		const p = migratePreset(input);
		if ((await resolvePresetAccess(p, await voiceClient())) !== "ready")
			throw new Error("askShare");
		const saved = await voiceStore().save({
			...(await voiceStore().read()),
			...p.settings,
			voiceId: p.voice.voiceId,
			voiceName: p.name,
		});
		notifyVoiceSettings();
		return saved;
	});
	voiceHandle("previewPreset", async (input) => {
		const p = migratePreset(input);
		const settings = await voiceStore().read();
		if (!settings.noticeAccepted) throw new Error("noticeRequired");
		const temp = await fs.mkdtemp(path.join(app.getPath("temp"), "mistarecorda-preview-"));
		try {
			const sample = path.join(
				app.getAppPath(),
				process.env.VITE_DEV_SERVER_URL ? "public" : "dist",
				"voice-preview.wav",
			);
			const out = await convertMicrophone(
				sample,
				{ ...defaultVoiceSettings, ...p.settings, voiceId: p.voice.voiceId },
				await voiceClient(),
				temp,
				new AbortController().signal,
				() => {
					/* Short, explicit preview. */
				},
			);
			return {
				...p,
				preview: {
					format: "wav" as const,
					base64: (await fs.readFile(out)).toString("base64"),
					text: "Welcome to MistaRecorda. This is a short voice preview for your next recording.",
				},
			};
		} finally {
			await fs.rm(temp, { recursive: true, force: true });
		}
	});
	voiceHandle("exportPreset", async (input) => {
		if (
			!input ||
			typeof input.includeSamples !== "boolean" ||
			typeof input.consent !== "boolean"
		)
			throw new Error("invalidSettings");
		if (input.includeSamples && !input.consent) throw new Error("sampleConsentRequired");
		const p = input.preset ? migratePreset(input.preset) : null;
		const pack = !p || input.includeSamples;
		const file = await dialog.showSaveDialog({
			defaultPath: p
				? `${p.name.replace(/[^a-zA-Z0-9 _-]/g, "_")}.${pack ? "mpvoice-pack" : "mpvoice"}`
				: "presets.mpvoice-pack",
			filters: [
				{ name: "MistaRecorda preset", extensions: [pack ? "mpvoice-pack" : "mpvoice"] },
			],
		});
		if (file.canceled || !file.filePath) return false;
		const audio = input.includeSamples ? await samples() : [];
		const data = pack
			? packPresets(
					p ? [p] : await store().list(),
					Object.fromEntries(audio.map((s, i) => [`${i}-${s.name}`, s.bytes])),
				)
			: encodePreset(p);
		await fs.writeFile(file.filePath, data);
		return true;
	});
	voiceHandle("inspectImport", async (input) => {
		let files: Array<{ name: string; bytes: Uint8Array }> = [];
		if (input) {
			if (
				typeof input.name !== "string" ||
				!Array.isArray(input.bytes) ||
				input.bytes.length > 100 * 1024 * 1024 ||
				!input.bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)
			)
				throw new Error("invalidPreset");
			files = [{ name: input.name, bytes: new Uint8Array(input.bytes) }];
		} else {
			const result = await dialog.showOpenDialog({
				properties: ["openFile", "multiSelections"],
				filters: [
					{ name: "MistaRecorda presets", extensions: ["mpvoice", "mpvoice-pack"] },
				],
			});
			if (result.canceled) return [];
			for (const file of result.filePaths) {
				if ((await fs.stat(file)).size > 100 * 1024 * 1024)
					throw new Error("presetTooLarge");
				files.push({ name: file, bytes: await fs.readFile(file) });
			}
		}
		return files.flatMap((f) =>
			f.name.endsWith(".mpvoice-pack")
				? unpackPresets(f.bytes)
				: [decodePreset(Buffer.from(f.bytes).toString("utf8"))],
		);
	});
	voiceHandle("importPreset", async (input) => {
		const p = migratePreset(input.preset);
		const status = await resolvePresetAccess(p, await voiceClient());
		if (status === "askShare") return { status, preset: p };
		const saved = await store().import(p, input.rename);
		if (saved.isFavorite) await store().favorite(saved.voice.voiceId, true);
		await synchronizeFavoriteVoice();
		notify();
		return { status, preset: saved };
	});
	voiceHandle("teamFolder", async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openDirectory", "createDirectory"],
		});
		if (result.canceled) return (await voiceStore().read()).teamFolder;
		const folder = await fs.realpath(result.filePaths[0]);
		await voiceStore().save({ ...(await voiceStore().read()), teamFolder: folder });
		await watchTeamFolder(folder);
		notifyVoiceSettings();
		notify();
		return folder;
	});
	voiceHandle("copyToTeam", async (input) => {
		const folder = (await voiceStore().read()).teamFolder;
		if (!folder) throw new Error("chooseTeamFolder");
		const p = await store().save(input, folder);
		await store().mergeTeam(folder);
		notify();
		return p;
	});
	voiceHandle("editVoice", async (input) => {
		if (
			!input ||
			typeof input.voiceId !== "string" ||
			typeof input.name !== "string" ||
			!input.name.trim() ||
			input.name.length > 160 ||
			typeof input.description !== "string" ||
			input.description.length > 2000 ||
			!input.labels ||
			typeof input.labels !== "object" ||
			Object.entries(input.labels).some(
				([k, v]) => k.length > 80 || typeof v !== "string" || v.length > 256,
			)
		)
			throw new Error("invalidSettings");
		if (input.addSamples && !input.consent) throw new Error("sampleConsentRequired");
		const api = await voiceClient();
		const previous = await api.getVoice(input.voiceId);
		if (!previous.canEdit) throw new Error("voiceNotOwned");
		const name = input.name.trim();
		await api.editVoice(
			input.voiceId,
			{ ...input, name, settings: validateSettings(input.settings) },
			input.addSamples ? await samples() : [],
		);
		const current = await voiceStore().read();
		// Preserve a separately chosen preset label; refresh an actual voice name.
		if (current.voiceId === input.voiceId && current.voiceName === previous.name) {
			await voiceStore().save({ ...current, voiceName: name });
			notifyVoiceSettings();
		}
		return true;
	});
	voiceHandle("shareVoice", async (input) => {
		if (
			!input ||
			!["viewer", "editor", "admin"].includes(input.role) ||
			!["email", "group"].includes(input.kind) ||
			typeof input.recipient !== "string" ||
			!input.recipient.trim() ||
			input.recipient.length > 320
		)
			throw new Error("invalidSettings");
		return (await voiceClient()).shareVoice(
			input.voiceId,
			input.role,
			input.kind === "email"
				? { user_email: input.recipient.trim() }
				: { group_id: input.recipient.trim() },
		);
	});
}
