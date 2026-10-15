export type EnvironmentAudio = { microphone: boolean; system: boolean };
export const defaultEnvironmentAudio: EnvironmentAudio = { microphone: true, system: true };
export function environmentAudioUnavailable(
	target: EnvironmentAudio,
	captured: EnvironmentAudio,
	nativeWindows: boolean,
) {
	if ((target.microphone && !captured.microphone) || (target.system && !captured.system))
		return "This take started without one of this environment’s audio inputs. Stop recording and enable both inputs before switching to it.";
	if (nativeWindows)
		return "Stop recording to change environment audio in native Windows capture.";
	return "";
}
