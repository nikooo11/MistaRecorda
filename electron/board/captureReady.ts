/** Establish the clean drawing window before ScreenCaptureKit snapshots available windows. */
export async function ensureDrawingSurfaceReady(ops: {
	enabled: () => boolean;
	prepare: () => Promise<void>;
	show: () => void;
	waitForCanvas: () => Promise<void>;
	recover: () => Promise<void>;
}) {
	if (!ops.enabled()) return;
	await ops.prepare();
	ops.show();
	try {
		await ops.waitForCanvas();
	} catch {
		await ops.recover();
		ops.show();
		await ops.waitForCanvas();
	}
}

export function captureWindowId(sourceId: string) {
	const match = /^window:(\d+):\d+$/.exec(sourceId);
	const id = match ? Number(match[1]) : NaN;
	if (!Number.isSafeInteger(id) || id <= 0 || id > 0xffffffff)
		throw Error("Invalid drawing capture window.");
	return id;
}
