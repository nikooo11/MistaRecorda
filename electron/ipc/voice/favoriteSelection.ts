import type { VoiceSettingsStore } from "./settings";
import type { PresetStore } from "./presets";

/** Selection is local: startup and starring a voice never upload audio or call ElevenLabs. */
export async function selectSingleFavorite(
	settingsStore: Pick<VoiceSettingsStore, "read" | "save">,
	presets: Pick<PresetStore, "favorites" | "entries">,
	hint?: { voiceId: string; name?: string },
) {
	const ids = [...new Set(await presets.favorites())];
	if (ids.length !== 1) return;
	const current = await settingsStore.read();
	const voiceId = ids[0];
	const entries = await presets.entries(current.teamFolder);
	const voiceName =
		(hint?.voiceId === voiceId ? hint.name : undefined) ||
		(current.voiceId === voiceId ? current.voiceName : "") ||
		entries.find((e) => e.preset.voice.voiceId === voiceId)?.preset.voice.originalName ||
		voiceId;
	if (current.voiceId === voiceId && current.voiceName === voiceName) return;
	// Keep the user's model and effects; favoriting a voice is not applying a preset.
	await settingsStore.save({ ...current, voiceId, voiceName });
}
