export const SETTING_HELP = {
	sources: {
		title: "Screens & windows",
		what: "Chooses the picture your audience sees.",
		when: "Use one window for a focused lesson, or a whole display when moving between apps.",
		how: "Click a preview below. To switch quickly later, click its shortcut box, hold your keys, then release them all. Yellow explains a conflict.",
	},
	camera: {
		title: "Face camera",
		what: "Adds your camera as a separate layer over the screen.",
		when: "Use it for introductions or reactions. Leave it off when viewers need all the space for detail.",
		how: "Click Add camera, choose a position below and adjust Size. You can also drag the floating camera during recording; its movement remains editable.",
	},
	environments: {
		title: "Environments",
		what: "Saves a screen or window, camera layout, and audio on/off as one setup.",
		when: "Useful when a presentation moves between slides, a browser and a demonstration.",
		how: "Choose a source and camera layout first. Click Save current setup, name it, check both audio choices, and set a shortcut. Recall it with its button or shortcut.",
	},
	soundRecording: {
		title: "Include soundboard in recording",
		what: "On includes sound effects in the recorded audio. Off saves them as separate, movable editor clips.",
		when: "Leave on for a quick finished take. Turn off before recording when you want to fix sound timing afterward.",
		how: "Set this before recording, then play sounds from Mac, iPad or hotkeys. Use headphones so speaker playback does not enter your microphone twice.",
	},
	microphone: {
		title: "Microphone & computer audio",
		what: "Microphone captures your voice; computer audio captures app sounds and videos.",
		when: "Keep both on for narrated demos. Turn computer audio off for a voice-only lesson, or the mic off for a silent demo.",
		how: "Select your microphone in this menu. The computer-audio button toggles app sound. Use headphones and listen to a short test before a long take.",
	},
	countdown: {
		title: "Countdown",
		what: "Waits before the recording starts.",
		when: "3 seconds suits most recordings; 5–10 seconds gives you time to prepare. No delay is useful for a quick capture.",
		how: "Choose a time here, then press Record. Position your cursor and begin speaking once the countdown ends.",
	},
	streamDriver: {
		title: "Optional virtual audio device",
		what: "A virtual cable carries MistaRecorda’s microphone and soundboard mix into another app.",
		when: "Needed for Stream mode into OBS, Zoom or Discord. Screen recording and editing work without it.",
		how: "On Mac, use Install BlackHole below if no compatible device is installed. Complete the macOS installer, restart if asked, then check again. No computer audio defaults need changing.",
	},
	streamRoutes: {
		title: "Choose audio routes",
		what: "Input is your voice, virtual output goes to the other app, and preview lets you hear sounds locally.",
		when: "Set these once before a stream or call; check again if you unplug or change devices.",
		how: "Click Refresh audio devices. Choose your real microphone (or a live voice changer), BlackHole 2ch as virtual output on Mac, and headphones for preview. Use different devices for input and output.",
	},
	streamInput: {
		title: "Microphone / live voice changer",
		what: "The voice that MistaRecorda mixes with your soundboard.",
		when: "Choose your normal microphone for a natural voice. Select an external voice changer’s input only when that app is running.",
		how: "Pick an input after refreshing devices. Do not select the same virtual cable used as output. ElevenLabs processes recordings later; it does not change this live input.",
	},
	streamOutput: {
		title: "Virtual output",
		what: "Sends the mix to a virtual device instead of directly to your speakers.",
		when: "Use BlackHole 2ch on Mac, or a compatible virtual cable on Windows, to feed a call or streaming app.",
		how: "Select the virtual output here. In OBS, Zoom or Discord, choose that cable’s receiving device as microphone. Disable duplicate mic capture there.",
	},
	streamMonitor: {
		title: "Sound preview / headphones",
		what: "Where you hear soundboard effects yourself.",
		when: "Choose headphones to hear cues without your microphone picking up speaker playback.",
		how: "Select your headphones here. Keep preview separate from virtual output. System output uses the device already selected in your computer’s sound settings.",
	},
	streamStart: {
		title: "Start & test Stream mode",
		what: "Starts sending the mix to the virtual output. It does not start a broadcast or share video.",
		when: "Start after choosing the three routes, before joining your call or going live.",
		how: "Confirm the output is virtual, then click Start Stream mode. In your receiving app, select the virtual cable as mic and test your voice and one quiet sound. Stop Stream mode when finished.",
	},
	export: {
		title: "Export settings",
		what: "Turns your edited take into a video file you can share.",
		when: "For lessons and demos, use MP4, Original size, 30 fps and Balanced encoding. GIF is for short, silent loops.",
		how: "Review the preview, open Export, choose the settings and export. Use smaller dimensions for quick sharing; use 60 fps for fast motion captured at 60 fps. Fast encoding saves time; Quality prioritizes compression.",
	},
	zoom: {
		title: "Recording zoom",
		what: "Emphasizes details by following or holding the cursor’s position.",
		when: "Use for small buttons or text. Keep the view still while viewers are reading.",
		how: "Set your shortcut and zoom amount. Hold the shortcut to follow the cursor, or tap to lock and tap again to zoom out. You can refine zooms in the editor.",
	},
} as const;
export type SettingHelpId = keyof typeof SETTING_HELP;

export const SETTINGS_TOURS = {
	capture: [
		{ id: "sources", tab: "layers" },
		{ id: "camera", tab: "layers" },
		{ id: "environments", tab: "scenes" },
		{ id: "soundRecording", tab: "controls" },
	],
	stream: [
		{ id: "streamDriver", tab: "sounds" },
		{ id: "streamRoutes", tab: "sounds" },
		{ id: "streamStart", tab: "sounds" },
	],
} as const;
export type SettingsTourId = keyof typeof SETTINGS_TOURS;
export interface SettingsTourRequest {
	id: SettingsTourId;
	start: number;
	token: number;
}
