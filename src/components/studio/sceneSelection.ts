import type { RecordingScene, StudioInfo } from "../../types/studio";
import { isSelectedSource } from "./sourceSwitching";

export function isCurrentScene(scene: RecordingScene, info: StudioInfo) {
	return (
		isSelectedSource(scene.source, info.selectedSource) &&
		scene.camera === !!info.camera?.enabled &&
		(!scene.audio ||
			(info.audio?.microphone === scene.audio.microphone &&
				info.audio?.system === scene.audio.system)) &&
		(!scene.camera ||
			!scene.cameraLayout ||
			Object.entries(scene.cameraLayout).every(
				([key, value]) =>
					info.settings.cameraLayout[key as keyof typeof scene.cameraLayout] === value,
			))
	);
}
