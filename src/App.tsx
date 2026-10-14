import { CameraOverlay } from "./components/studio/CameraOverlay";
import { StudioPanel } from "./components/studio/StudioPanel";
import { lazy, Suspense } from "react";
const BoardWindow = lazy(() =>
	import("./components/board/BoardWindows").then((m) => ({ default: m.BoardWindow })),
);
import { VoiceNotifications } from "./components/voice/VoiceNotifications";
import { VoicePanel } from "./components/voice/VoicePanel";
import { RecordingZoomSettingsPanel } from "./components/recording-zoom/RecordingZoomSettings";
import { useEffect, useState } from "react";
import { CountdownOverlay } from "./components/countdown/CountdownOverlay";
import { LaunchWindow } from "./components/launch/LaunchWindow";
import { SourceSelector } from "./components/launch/SourceSelector";
import { UpdateToastWindow } from "./components/launch/UpdateToastWindow";
import { Toaster } from "./components/ui/sonner";
import { ShortcutsConfigDialog } from "./components/video-editor/ShortcutsConfigDialog";
import VideoEditor from "./components/video-editor/VideoEditor";
import { useI18n } from "./contexts/I18nContext";
import { ShortcutsProvider } from "./contexts/ShortcutsContext";
import { loadAllCustomFonts } from "./lib/customFonts";

export default function App() {
	const [windowType, setWindowType] = useState("");
	const { t } = useI18n();
	const isMacOS = /mac/i.test(navigator.platform);
	const appIconSrc = "/app-icons/mistarecorda-128.png";

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const type = params.get("windowType") || "";
		setWindowType(type);
		document.documentElement.dataset.windowType = type;

		if (
			type.startsWith("board-") ||
			type === "hud-overlay" ||
			type === "source-selector" ||
			type === "countdown" ||
			(type === "update-toast" && isMacOS)
		) {
			document.body.style.background = "transparent";
			document.documentElement.style.background = "transparent";
			document.getElementById("root")?.style.setProperty("background", "transparent");
		}

		if (type === "hud-overlay") {
			document.documentElement.classList.add("hud-overlay-window");
			document.body.classList.add("hud-overlay-window");
			document.getElementById("root")?.classList.add("hud-overlay-window");
			window.electronAPI?.hudOverlaySetIgnoreMouse?.(true);
		} else if (type === "update-toast") {
			document.documentElement.style.overflow = "visible";
			document.body.style.overflow = "visible";
			document.getElementById("root")?.style.setProperty("overflow", "visible");
		}

		loadAllCustomFonts().catch((error) => {
			console.error("Failed to load custom fonts:", error);
		});
	}, [isMacOS]);

	useEffect(() => {
		document.title =
			windowType === "editor"
				? t("app.editorTitle", "Recordly Editor")
				: t("app.name", "Recordly");
	}, [windowType, t]);

	switch (windowType) {
		case "board-panel":
		case "board-editor":
		case "board-surface":
		case "board-hint":
		case "board-stream":
			return (
				<Suspense fallback={null}>
					<BoardWindow kind={windowType} />
				</Suspense>
			);
		case "camera-overlay":
			return <CameraOverlay />;
		case "studio":
			return <StudioPanel />;
		case "zoom-settings":
			return <RecordingZoomSettingsPanel />;
		case "voice":
			return (
				<>
					<VoiceNotifications />
					<VoicePanel />
					<Toaster />
				</>
			);
		case "hud-overlay":
			return (
				<>
					<VoiceNotifications />
					<LaunchWindow />
					<Toaster className="pointer-events-auto" />
				</>
			);
		case "source-selector":
			return <SourceSelector />;
		case "countdown":
			return <CountdownOverlay />;
		case "update-toast":
			return <UpdateToastWindow />;
		case "editor":
			return (
				<ShortcutsProvider>
					<VoiceNotifications />
					<VideoEditor />
					<ShortcutsConfigDialog />
				</ShortcutsProvider>
			);
		default:
			return (
				<div className="flex h-full w-full items-center justify-center bg-editor-bg text-foreground">
					<div className="flex items-center gap-4 rounded-2xl border border-foreground/10 bg-foreground/5 px-6 py-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
						<img
							src={appIconSrc}
							alt={t("app.name", "Recordly")}
							className="h-12 w-12 rounded-xl"
						/>
						<div>
							<h1 className="text-xl font-semibold tracking-tight">
								{t("app.name", "Recordly")}
							</h1>
							<p className="text-sm text-foreground/65">
								{t("app.subtitle", "Screen recording and editing")}
							</p>
						</div>
					</div>
				</div>
			);
	}
}
