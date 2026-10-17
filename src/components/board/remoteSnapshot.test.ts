import { expect, test } from "vitest";
import { mergeRemoteSnapshot } from "./remoteSnapshot";
import type { RemoteInfo } from "../../types/remote";
const initial: RemoteInfo = {
	sequence: 1,
	status: { recording: false, paused: false, webcam: false, elapsed: 0 },
	scenes: [],
	sceneId: "",
	camera: false,
	zoom: false,
	zoomAvailable: false,
	whiteboard: false,
	sounds: [],
	memes: [],
	armed: { id: "m", name: "Meme", kind: "meme", token: "token", preview: "data:image" },
};
test("lightweight status retains the library and private preview, then clears deployed reference", () => {
	const { sounds, memes, ...live } = initial;
	const next = mergeRemoteSnapshot(initial, {
		...live,
		sequence: 2,
		armed: { ...live.armed!, preview: undefined },
	});
	expect(next?.memes).toBe(memes);
	// Server omits the preview field, rather than clearing it.
	const { preview, ...armed } = initial.armed!;
	expect(mergeRemoteSnapshot(initial, { ...live, sequence: 2, armed })?.armed?.preview).toBe(
		preview,
	);
	const deployed = mergeRemoteSnapshot(initial, { ...live, sequence: 3, armed: null });
	expect(deployed?.armed).toBe(null);
	expect(mergeRemoteSnapshot(deployed, { ...live, sequence: 2 })).toBe(deployed);
	expect(mergeRemoteSnapshot(undefined, live)).toBeUndefined();
});
