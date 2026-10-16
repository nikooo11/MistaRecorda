import type { SceneMediaSource } from "../../types/studio";

/** Use the release coordinates as well as move events, including a fast drag. */
export function transformSceneLayer(
	drag: {
		x: number;
		y: number;
		width: number;
		height: number;
		source: SceneMediaSource;
		resize: boolean;
	},
	x: number,
	y: number,
): Partial<SceneMediaSource> {
	const { source, resize } = drag;
	const dx = (x - drag.x) / Math.max(1, drag.width);
	const dy = (y - drag.y) / Math.max(1, drag.height);
	const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
	return resize
		? {
				width: clamp(source.width + dx, 0.05, 1 - source.x),
				height: clamp(source.height + dy, 0.05, 1 - source.y),
			}
		: {
				x: clamp(source.x + dx, 0, 1 - source.width),
				y: clamp(source.y + dy, 0, 1 - source.height),
			};
}
