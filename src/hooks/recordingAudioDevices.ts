export type RecordingAudioDevice = Pick<MediaDeviceInfo, "deviceId" | "groupId" | "label">;
let cachedInputs: RecordingAudioDevice[] = [];

export function rememberRecordingAudioDevices(devices: MediaDeviceInfo[]) {
	cachedInputs = devices
		.filter((device) => device.kind === "audioinput")
		.map(({ deviceId, groupId, label }) => ({ deviceId, groupId, label }));
	return cachedInputs;
}

// Chromium can leave enumerateDevices pending while the HUD is hidden. Global
// recording shortcuts must use the last visible device list in that case.
export async function getRecordingAudioDevices(
	mediaDevices: Pick<MediaDevices, "enumerateDevices">,
	visible: boolean,
): Promise<RecordingAudioDevice[]> {
	if (!visible) return cachedInputs;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			mediaDevices.enumerateDevices().then(rememberRecordingAudioDevices),
			new Promise<RecordingAudioDevice[]>((resolve) => {
				timer = setTimeout(() => resolve(cachedInputs), 1000);
			}),
		]);
	} catch {
		return cachedInputs;
	} finally {
		clearTimeout(timer);
	}
}
