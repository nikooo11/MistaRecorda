export type GuideTrack = "record" | "stream";
export type GuideDestination = "controls" | "layers" | "sounds";
export interface GuideStep {
	title: string;
	intro: string;
	settings: { label: string; value: string; why: string }[];
	tip: string;
	flow: string[];
	action?: {
		label: string;
		destination: GuideDestination;
		tour: "capture" | "stream";
		start: number;
	};
}
export const GUIDE_SEEN_KEY = "mistarecorda.settings-guide.seen.v1";
export const GUIDE_PROGRESS_KEY = "mistarecorda.settings-guide.progress.v1";
export const GUIDE_STEPS: Record<GuideTrack, GuideStep[]> = {
	record: [
		{
			title: "Choose what viewers will see",
			intro: "For a lesson, demo or walkthrough, start with one window. No extra audio driver is needed.",
			settings: [
				{
					label: "Source",
					value: "One window",
					why: "Keeps the recording focused on the app you are explaining. Use a whole screen when you need several apps together.",
				},
				{
					label: "Countdown",
					value: "3 seconds · default",
					why: "Gives you time to settle your cursor and start speaking. Choose 5–10 seconds if you need more preparation.",
				},
				{
					label: "Face camera",
					value: "Off until enabled",
					why: "Turn it on for a personal introduction. Drag it away from important content; its movement stays editable.",
				},
			],
			tip: "Open Layers to choose your window. Save an environment when you want to reuse a window, camera position and audio choices.",
			flow: ["Choose window", "3-second countdown", "Record"],
			action: {
				label: "Show me the source and camera controls",
				destination: "layers",
				tour: "capture",
				start: 0,
			},
		},
		{
			title: "Capture your voice and computer sound",
			intro: "Both audio inputs start on. You can change them from the microphone menu on the recorder.",
			settings: [
				{
					label: "Microphone",
					value: "On · default",
					why: "Records your narration. Use the microphone you speak into; turn it off for a silent demonstration.",
				},
				{
					label: "Computer audio",
					value: "On · default",
					why: "Includes videos and app sounds. Turn it off for voice-only lessons or to keep notifications out of the audio.",
				},
				{
					label: "Include soundboard in recording",
					value: "On · default",
					why: "Sounds become part of the finished take. Turn it off before recording if you want separate sound clips to move later.",
				},
			],
			tip: "Use headphones: sound from speakers can enter the microphone and be recorded twice. Record a short test and listen before a long take.",
			flow: ["Microphone + computer", "Your recording", "Edit later"],
			action: {
				label: "Show me sound recording settings",
				destination: "controls",
				tour: "capture",
				start: 3,
			},
		},
		{
			title: "Keep the presentation easy to follow",
			intro: "Add only the effects that help explain your point. They remain editable after recording.",
			settings: [
				{
					label: "Zoom",
					value: "Use for small details",
					why: "Hold the configured zoom shortcut to follow the cursor; tap to hold a detail. Avoid zooming repeatedly while viewers are reading.",
				},
				{
					label: "Background",
					value: "Still for detailed lessons",
					why: "A still background helps viewers focus on text. Try gentle motion for commentary, with enough margin around the screen.",
				},
				{
					label: "Captions and voice",
					value: "Add in the editor",
					why: "Generate captions, then correct mistakes. Your own voice is always recorded first; ElevenLabs runs only when you click Process.",
				},
			],
			tip: "On iPad, highlighted Draw lets you write; turn it off to pan and pinch. Clear drawings keeps your chosen pen color. Notes can stay private as shadow objects.",
			flow: ["Record normally", "Adjust visuals", "Review captions"],
		},
		{
			title: "Export a clear, shareable video",
			intro: "The starting export settings preserve readable screen detail. Review a few seconds before sharing.",
			settings: [
				{
					label: "Format",
					value: "MP4 · default",
					why: "A practical choice for videos with sound. Use GIF only for short, silent loops.",
				},
				{
					label: "Size / frame rate",
					value: "Original · 30 fps · defaults",
					why: "Original keeps small text readable; 30 fps suits slides and tutorials. Choose a smaller size for quick sharing, or 60 fps for fast motion recorded at 60 fps.",
				},
				{
					label: "Encoding",
					value: "Balanced · Auto · defaults",
					why: "Balances processing time and file size, with automatic encoder choice. Use Fast for a draft; Quality when size matters more than export time.",
				},
			],
			tip: "Make a 10-second test: speak, move the pointer, play one sound, then review the video and audio. Leave Stream mode off when recording in MistaRecorda.",
			flow: ["Review", "MP4 · 30 fps", "Export"],
		},
	],
	stream: [
		{
			title: "Send audio into your streaming or call app",
			intro: "Stream mode sends your microphone and soundboard together to OBS, Zoom or Discord. It does not broadcast video by itself.",
			settings: [
				{
					label: "Virtual audio device",
					value: "Optional installation",
					why: "This is a virtual cable between apps. On Mac, install BlackHole from Sound effects → Stream only if you need this audio route.",
				},
				{
					label: "Headphones",
					value: "Recommended",
					why: "Keeps soundboard playback and other people's voices from leaking back into your microphone.",
				},
				{
					label: "Stream mode",
					value: "Off until you start it",
					why: "You control when audio is sent. Screen recording and editing work without the driver.",
				},
			],
			tip: "Already have a compatible virtual device? Use it. BlackHole setup opens the official installer; macOS may ask for approval and a restart.",
			flow: ["Mic + soundboard", "Virtual cable", "OBS / Zoom / Discord"],
			action: {
				label: "Show me Stream setup",
				destination: "sounds",
				tour: "stream",
				start: 0,
			},
		},
		{
			title: "Choose three audio routes",
			intro: "In Sound effects → Stream, refresh audio devices and choose the following routes.",
			settings: [
				{
					label: "Microphone / live voice changer",
					value: "Your real microphone",
					why: "Start with your normal voice. If using an external live voice changer, choose its microphone instead.",
				},
				{
					label: "Virtual output",
					value: "BlackHole 2ch on Mac",
					why: "Carries the mixed sound into the receiving app. Never use the same virtual device as both input and output.",
				},
				{
					label: "Sound preview / headphones",
					value: "Your headphones",
					why: "Lets you hear the soundboard locally. Keep it separate from the virtual output to avoid a feedback loop.",
				},
			],
			tip: "Confirm the output is a virtual device, then click Start Stream mode. Keep your computer's normal speaker and microphone defaults unchanged.",
			flow: ["Real microphone", "MistaRecorda mix", "BlackHole 2ch"],
			action: {
				label: "Show me the audio routes",
				destination: "sounds",
				tour: "stream",
				start: 1,
			},
		},
		{
			title: "Connect the receiving app",
			intro: "Select the same virtual device as the microphone in the app your audience uses.",
			settings: [
				{
					label: "OBS Studio",
					value: "Audio Input Capture → BlackHole 2ch",
					why: "Add one audio source for this mix. Disable any second source capturing the same microphone or soundboard, or viewers may hear it twice.",
				},
				{
					label: "Zoom",
					value: "Settings → Audio → Microphone",
					why: "Choose BlackHole 2ch as microphone and your headphones as speaker. Use Test Mic before joining a call.",
				},
				{
					label: "Discord",
					value: "Voice & Video → Input device",
					why: "Choose BlackHole 2ch and test the microphone. If effects are cut off, review noise suppression for this mixed input.",
				},
			],
			tip: "Video is separate: choose a window or display in OBS, or share your screen in Zoom/Discord. On Windows, substitute your virtual cable's receiving/input device name.",
			flow: ["BlackHole output", "App microphone input", "Your audience"],
		},
		{
			title: "Check once, then go live",
			intro: "A short rehearsal is the easiest way to catch missing or doubled audio.",
			settings: [
				{
					label: "Voice",
					value: "Speak at normal volume",
					why: "Check the receiving app's meter. Lower levels if it reaches red, then listen to a test recording or microphone test.",
				},
				{
					label: "Soundboard",
					value: "Play one quiet test sound",
					why: "Check that it reaches the receiving app once and your voice is still easy to hear. Call apps may suppress music or effects.",
				},
				{
					label: "Finish",
					value: "Stop Stream mode",
					why: "Stops sending the mix. Starting a MistaRecorda recording also stops Stream mode; they are separate workflows.",
				},
			],
			tip: "ElevenLabs converts recorded narration after a take. Live voice changing requires a separate compatible app; the recorded voice buttons do not change your live microphone.",
			flow: ["Test voice", "Test one sound", "Start your stream / call"],
		},
	],
};

export function readGuideProgress(value: unknown): Partial<Record<GuideTrack, number>> {
	if (!value || typeof value !== "object") return {};
	const result: Partial<Record<GuideTrack, number>> = {};
	for (const track of ["record", "stream"] as const) {
		const step = (value as Record<string, unknown>)[track];
		if (typeof step === "number" && Number.isInteger(step))
			result[track] = Math.max(0, Math.min(GUIDE_STEPS[track].length, step));
	}
	return result;
}
