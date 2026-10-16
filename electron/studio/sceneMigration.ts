import type { StudioSettings } from "../../src/types/studio";

/** Preserve existing shortcut intent while moving all recall controls into scenes. */
export function migrateWindowShortcuts(settings: StudioSettings): StudioSettings {
	if (!settings.windows.length) return settings;
	const scenes = [...settings.scenes];
	for (const slot of settings.windows) {
		if (slot.shortcut && scenes.some((s) => s.shortcut === slot.shortcut)) continue;
		scenes.push({
			id: crypto.randomUUID(),
			name: (
				settings.sourceAliases?.find((s) => s.source.id === slot.source.id)?.name ??
				slot.source.name
			).slice(0, 60),
			source: slot.source,
			shortcut: slot.shortcut,
			camera: true,
			cameraLayout: { ...settings.cameraLayout },
			audio: { microphone: true, system: true },
			media: [],
		});
	}
	return { ...settings, windows: [], scenes };
}
