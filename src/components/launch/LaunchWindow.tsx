import { useEffect } from "react";
import { loadAppSetting, saveAppSetting } from "../../lib/appSettings";
import { GUIDE_SEEN_KEY } from "../settings-guide/guideContent";
import { useScreenRecorder } from "../../hooks/useScreenRecorder";
import { useLaunchWindowActions } from "./hooks/useLaunchWindowActions";
import { useLaunchWindowSystemState } from "./hooks/useLaunchWindowSystemState";
import { useRecordingTimer } from "./hooks/useRecordingTimer";
import { RecordingStudio } from "./RecordingStudio";

/** This window owns the recorder for its lifetime, including while minimized. */
export function LaunchWindow() {
	const recorder = useScreenRecorder();
	const {
		recording,
		paused,
		webcamEnabled,
		webcamDeviceId,
		toggleRecording,
		pauseRecording,
		resumeRecording,
		setWebcamEnabled,
		microphoneEnabled,
		setMicrophoneEnabled,
		systemAudioEnabled,
		setSystemAudioEnabled,
		resetRecordingDefaults,
	} = recorder;
	const { elapsed, formatTime } = useRecordingTimer(recording, paused);
	const actions = useLaunchWindowActions();
	const { selectedSource, syncSelectedSource } = actions;
	const { platform } = useLaunchWindowSystemState(recorder.preparePermissions);
	useEffect(() => {
		if (loadAppSetting(GUIDE_SEEN_KEY) === true) return;
		void window.electronAPI.studio
			.request("openSettingsGuide")
			.then(() => saveAppSetting(GUIDE_SEEN_KEY, true))
			.catch(() => undefined);
	}, []);
	useEffect(() => {
		void window.electronAPI.studio
			.request("cameraStatus", {
				enabled: webcamEnabled,
				deviceId: webcamDeviceId,
				preview: true,
			})
			.catch(console.error);
	}, [webcamEnabled, webcamDeviceId, recording]);
	useEffect(() => {
		let mounted = true;

		void window.electronAPI.getSelectedSource().then((source) => {
			if (mounted) syncSelectedSource(source);
		});

		const cleanup = window.electronAPI.onSelectedSourceChanged((source) => {
			if (mounted) syncSelectedSource(source);
		});

		return () => {
			mounted = false;
			cleanup?.();
		};
	}, [syncSelectedSource]);

	useEffect(
		() =>
			window.electronAPI.board.on("control", (action) => {
				if (action === "recording-defaults" && !recording) resetRecordingDefaults();
				if (action === "record") void toggleRecording();
				if (action === "pause" && recording) {
					if (paused) resumeRecording();
					else pauseRecording();
				}
				if (action === "webcam") setWebcamEnabled(!webcamEnabled);
				if (action === "webcam-on") setWebcamEnabled(true);
				if (action === "webcam-off") setWebcamEnabled(false);
				if (action === "microphone-on") setMicrophoneEnabled(true);
				if (action === "microphone-off") setMicrophoneEnabled(false);
				if (action === "system-audio-on") setSystemAudioEnabled(true);
				if (action === "system-audio-off") setSystemAudioEnabled(false);
			}),
		[
			recording,
			paused,
			webcamEnabled,
			toggleRecording,
			pauseRecording,
			resumeRecording,
			setWebcamEnabled,
			setMicrophoneEnabled,
			setSystemAudioEnabled,
			resetRecordingDefaults,
		],
	);
	useEffect(() => {
		void window.electronAPI.studio
			.request("audioStatus", {
				recording,
				microphone: microphoneEnabled,
				system: systemAudioEnabled,
			})
			.catch(() => undefined);
	}, [recording, microphoneEnabled, systemAudioEnabled]);
	useEffect(() => {
		void window.electronAPI.board.request("status", {
			recording,
			paused,
			elapsed,
			webcam: webcamEnabled,
			webcamDeviceId,
			sourceName: selectedSource,
		});
	}, [recording, paused, elapsed, webcamEnabled, webcamDeviceId, selectedSource]);

	return (
		<RecordingStudio
			recorder={recorder}
			actions={actions}
			platform={platform ?? ""}
			elapsed={formatTime(elapsed)}
		/>
	);
}
