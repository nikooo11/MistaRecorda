import type { RemoteInfo, RemoteSnapshot } from "../../types/remote";
/** Polls omit large library images. Late replies must not re-arm a deployed item. */
export function mergeRemoteSnapshot(
	previous: RemoteInfo | undefined,
	next: RemoteSnapshot,
): RemoteInfo | undefined {
	if (previous && previous.sequence > next.sequence) return previous;
	const sounds = next.sounds ?? previous?.sounds,
		memes = next.memes ?? previous?.memes;
	if (!sounds || !memes) return previous;
	const armed =
		next.armed && next.armed.token === previous?.armed?.token
			? { ...previous.armed, ...next.armed }
			: next.armed;
	return { ...next, sounds, memes, armed };
}
