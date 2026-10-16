import { expect, it } from "vitest";
import { transformSceneLayer } from "./sceneLayerTransform";
import type { SceneMediaSource } from "../../types/studio";

const source = { x: 0.04, y: 0.08, width: 0.3, height: 0.5 } as SceneMediaSource;
const drag = { x: 100, y: 100, width: 1000, height: 500, source, resize: false };
it("maps movement to the preview's actual dimensions and keeps layers on canvas", () => {
	const moved = transformSceneLayer(drag, 300, 150);
	expect(moved.x).toBeCloseTo(0.24);
	expect(moved.y).toBeCloseTo(0.18);
	expect(transformSceneLayer(drag, 3000, -100)).toEqual({ x: 0.7, y: 0 });
});
it("resizes from release coordinates without depending on a preceding move render", () => {
	expect(transformSceneLayer({ ...drag, resize: true }, 0, 50)).toEqual({
		width: 0.19999999999999998,
		height: 0.4,
	});
	expect(transformSceneLayer({ ...drag, resize: true }, -5000, 9000)).toEqual({
		width: 0.05,
		height: 0.92,
	});
});
