import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { z } from "zod";
import type { VoiceCue } from "../../src/lib/voiceCues";
import { voiceColor } from "../../src/lib/voiceCues";
import type { VoiceInfo, VoiceSettings } from "../../src/types/voice";
import { getCursorCaptureElapsedMs, isCursorCapturePaused } from "../ipc/cursor/telemetry";
import { prepareRecordingAudio, writeAudioMetadata } from "../ipc/recording/library";
import { isCursorCaptureActive } from "../ipc/state";
import { PresetStore } from "../ipc/voice/presets";
import { voiceClient, voiceStore } from "../ipc/voice/register";
import { validateVoiceCues } from "./validateVoiceCues";

let choices: Pick<VoiceInfo, "voiceId" | "name">[] = [];
const catalogPath = () => path.join(app.getPath("userData"), "studio", "voice-catalog.json");
const catalogSchema = z
	.array(z.object({ voiceId: z.string().min(1).max(100), name: z.string().max(500) }))
	.max(5000);
let selected: VoiceSettings | null = null;
let cues: VoiceCue[] = [];
export async function recordingVoiceList(refresh = false) {
	const store = voiceStore();
	if (!choices.length) {
		try {
			choices = catalogSchema.parse(JSON.parse(await fs.readFile(catalogPath(), "utf8")));
		} catch {
			/* No saved catalog yet. */
		}
	}
	// Keychain authentication can block Electron's main thread. Never unlock it during a take.
	if (refresh && !isCursorCaptureActive && (await store.hasKey())) {
		choices = catalogSchema.parse(await (await voiceClient()).voices());
		await fs.mkdir(path.dirname(catalogPath()), { recursive: true });
		await fs.writeFile(catalogPath(), JSON.stringify(choices), { mode: 0o600 });
	}
	const favorites = await new PresetStore(
		path.join(app.getPath("userData"), "presets"),
	).favorites();
	return {
		recording: isCursorCaptureActive,
		selected: selected?.voiceId ?? "",
		hasKey: await store.hasKey(),
		voices: [...choices]
			.sort(
				(a, b) =>
					Number(favorites.includes(b.voiceId)) - Number(favorites.includes(a.voiceId)),
			)
			.map((v) => ({
				id: v.voiceId,
				name: v.name,
				favorite: favorites.includes(v.voiceId),
				color: voiceColor(v.voiceId),
			})),
	};
}
export async function selectRecordingVoice(id: string) {
	if (isCursorCaptureActive && isCursorCapturePaused())
		throw Error("Resume recording before changing voice cues.");
	if (isCursorCaptureActive && cues.length >= 200)
		throw Error("This take has reached 200 voice changes.");
	const voice = choices.find((v) => v.voiceId === id);
	if (id && !voice) throw Error("Refresh your voices, then choose one from the list.");
	selected = voice
		? {
				...(await voiceStore().read()),
				voiceId: voice.voiceId,
				voiceName: voice.name,
				teamFolder: "",
			}
		: null;
	if (isCursorCaptureActive) {
		const startMs = Math.round(getCursorCaptureElapsedMs());
		cues = cues.filter((c) => c.startMs < startMs);
		cues.push({
			id: crypto.randomUUID(),
			startMs,
			settings: selected,
			color: selected ? voiceColor(selected.voiceId) : "#777e89",
		});
	}
	return recordingVoiceList();
}
export function startVoiceCues() {
	cues = [
		{
			id: crypto.randomUUID(),
			startMs: 0,
			settings: selected,
			color: selected ? voiceColor(selected.voiceId) : "#777e89",
		},
	];
}
export async function persistVoiceCues(videoPath: string) {
	if (!cues.some((c) => c.settings)) return;
	const metadata = await prepareRecordingAudio(videoPath);
	if (!metadata.micPath) return;
	await writeAudioMetadata({
		...metadata,
		voiceCues: validateVoiceCues(cues),
		voiceChangeEnabled: true,
		micSelection: "original",
	});
}
