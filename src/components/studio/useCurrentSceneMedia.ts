import { useCallback, useEffect, useRef, useState } from "react";
import type { SceneMediaSource, StudioInfo } from "../../types/studio";

/** Serialize autosaves and coalesce slider changes; a slow save cannot overwrite a newer edit. */
export function useCurrentSceneMedia(
	info: StudioInfo | undefined,
	receive: (info: StudioInfo) => void,
) {
	const [media, setMedia] = useState<SceneMediaSource[]>([]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const state = useRef({
		sceneId: info?.activeSceneId,
		pending: undefined as SceneMediaSource[] | undefined,
		writing: false,
	});
	const latest = useRef(info);
	latest.current = info;
	useEffect(() => {
		if (state.current.writing || state.current.pending) return;
		state.current.sceneId = info?.activeSceneId;
		setMedia(info?.settings.scenes.find((s) => s.id === info.activeSceneId)?.media ?? []);
	}, [info?.activeSceneId, info?.settings.scenes]);
	const change = useCallback(
		async (next: SceneMediaSource[]) => {
			setMedia(next);
			state.current.pending = next;
			if (state.current.writing) return;
			state.current.writing = true;
			setSaving(true);
			setError("");
			try {
				while (state.current.pending) {
					const value = state.current.pending;
					state.current.pending = undefined;
					const updated = await window.electronAPI.studio.request(
						"setCurrentSceneMedia",
						{ sceneId: state.current.sceneId, media: value },
					);
					state.current.sceneId = updated.activeSceneId;
					receive(updated);
				}
			} catch (e) {
				state.current.pending = undefined;
				setError(e instanceof Error ? e.message : String(e));
				const current = await window.electronAPI.studio
					.request("info")
					.catch(() => latest.current);
				if (current) {
					receive(current);
					state.current.sceneId = current.activeSceneId;
					setMedia(
						current.settings.scenes.find((s) => s.id === current.activeSceneId)
							?.media ?? [],
					);
				}
			} finally {
				state.current.writing = false;
				setSaving(false);
			}
		},
		[receive],
	);
	return { media, change, saving, error };
}
