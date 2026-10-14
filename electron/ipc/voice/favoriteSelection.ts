import type { VoiceSettingsStore } from "./settings";
import type { PresetStore } from "./presets";

/** Selection is local: startup and starring a voice never upload audio or call ElevenLabs. */
export async function selectSingleFavorite(
	settingsStore: Pick<VoiceSettingsStore, "read" | "save">,
	presets: Pick<PresetStore, "favorites" | "entries">,
	hint?: { voiceId: string; name?: string },
) {
	const ids = [...new Set(await presets.favorites())];
	if (!ids.length) return;
	const current = await settingsStore.read();
	const voiceId =
		hint && ids.includes(hint.voiceId) ? hint.voiceId : ids.length === 1 ? ids[0] : null;
	if (!voiceId) return;
	const entries = await presets.entries(current.teamFolder);
	const favoritePresets = entries.filter(
		(e) => e.preset.isFavorite && e.preset.voice.voiceId === voiceId,
	);
	const preset = favoritePresets.length === 1 ? favoritePresets[0].preset : undefined;
	const presetSettings = preset && (hint || current.voiceId !== voiceId) ? preset.settings : {};
	const voiceName =
		preset?.name ||
		(hint?.voiceId === voiceId ? hint.name : undefined) ||
		(current.voiceId === voiceId ? current.voiceName : "") ||
		entries.find((e) => e.preset.voice.voiceId === voiceId)?.preset.voice.originalName ||
		voiceId;
	if (
		current.voiceId === voiceId &&
		current.voiceName === voiceName &&
		!Object.keys(presetSettings).length
	)
		return;
	// A favorite team preset includes its shared model and effects. Plain voice favorites preserve tuning.
	await settingsStore.save({ ...current, ...presetSettings, voiceId, voiceName });
}
