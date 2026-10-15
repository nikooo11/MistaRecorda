import { useEffect, useRef, useState } from "react";
import { SiDiscord, SiObsstudio, SiZoom } from "react-icons/si";
import { loadAppSetting, saveAppSetting } from "../../lib/appSettings";
import { WindowHeader } from "../ui/WindowHeader";
import {
	GUIDE_PROGRESS_KEY,
	GUIDE_STEPS,
	type GuideTrack,
	readGuideProgress,
} from "./guideContent";
import "./settingsGuide.css";

export function SettingsGuide() {
	const [track, setTrack] = useState<GuideTrack>();
	const [step, setStep] = useState(0);
	const [progress, setProgress] = useState(() =>
		readGuideProgress(loadAppSetting(GUIDE_PROGRESS_KEY)),
	);
	const [error, setError] = useState("");
	const heading = useRef<HTMLHeadingElement>(null);
	const content = track ? GUIDE_STEPS[track][step] : undefined;
	useEffect(() => {
		heading.current?.focus();
		setError("");
	}, [track, step]);
	const save = (next: number) => {
		if (!track) return;
		const updated = { ...progress, [track]: next };
		setProgress(updated);
		saveAppSetting(GUIDE_PROGRESS_KEY, updated);
	};
	const openSettings = async () => {
		try {
			setError("");
			if (content?.action)
				await window.electronAPI.studio.request("showSettingsHelp", {
					id: content.action.tour,
					start: content.action.start,
				});
		} catch {
			setError("Could not open settings. Try the gear button on the recorder.");
		}
	};
	return (
		<main className="settings-guide">
			<WindowHeader>
				<strong>Settings tutorial</strong>
				<button onClick={() => window.close()}>Close</button>
			</WindowHeader>
			<div className="guide-body">
				{!track ? (
					<>
						<p className="guide-eyebrow">A good starting point</p>
						<h1 ref={heading} tabIndex={-1}>
							Help me choose settings
						</h1>
						<p className="guide-lead">
							Two short guides. Choose a workflow, then use Show me to follow
							highlights on the real controls. Click ? beside a setting for quick
							help.
						</p>
						<div className="guide-choices">
							{(["record", "stream"] as const).map((id) => (
								<button
									key={id}
									className="guide-choice"
									onClick={() => {
										setTrack(id);
										setStep(progress[id] === 4 ? 0 : (progress[id] ?? 0));
									}}
								>
									<div className={`guide-scenario ${id}`}>
										<div
											className="guide-art"
											role="img"
											aria-label={
												id === "record"
													? "A person recording a slide presentation on a laptop"
													: "A presenter wearing headphones with OBS, Discord and Zoom"
											}
										/>
										<strong className="guide-image-title">
											{id === "record"
												? "Screen Record"
												: "Streamer/Presenter"}
										</strong>
										{id === "stream" && (
											<div
												className="guide-app-badges"
												aria-label="OBS, Discord and Zoom"
											>
												<span>
													<SiObsstudio aria-hidden="true" /> OBS
												</span>
												<span>
													<SiDiscord aria-hidden="true" /> Discord
												</span>
												<span>
													<SiZoom aria-hidden="true" /> Zoom
												</span>
											</div>
										)}
									</div>
									<div className="guide-choice-copy">
										<p>
											{id === "record"
												? "Lessons, demos and narrated videos. Ready without extra drivers."
												: "Microphone + sounds into OBS, Zoom or Discord. Optional audio setup."}
										</p>
										<span>
											{progress[id] === 4
												? "Review guide"
												: progress[id]
													? "Continue guide"
													: "Start guide"}{" "}
											→ <small>4 steps · about 2 min</small>
										</span>
									</div>
								</button>
							))}
						</div>
						<p className="guide-note">
							You can skip this and start recording. Reopen it from Capture settings
							or the editor's Settings tab.
						</p>
						<button className="guide-secondary" onClick={() => window.close()}>
							Skip for now
						</button>
					</>
				) : content ? (
					<>
						<div className="guide-step-top">
							<button onClick={() => setTrack(undefined)}>← All guides</button>
							<span>
								{track === "record" ? "Screen recording" : "Streaming & calls"} ·{" "}
								{step + 1} of 4
							</span>
						</div>
						<nav className="guide-progress" aria-label="Tutorial steps">
							{GUIDE_STEPS[track].map((s, index) => (
								<button
									key={s.title}
									aria-label={`Step ${index + 1}: ${s.title}`}
									aria-current={step === index ? "step" : undefined}
									onClick={() => {
										setStep(index);
										save(index);
									}}
								>
									<span>{index + 1}</span>
								</button>
							))}
						</nav>
						<h1 ref={heading} tabIndex={-1}>
							{content.title}
						</h1>
						<p className="guide-lead">{content.intro}</p>
						<ol className="guide-flow" aria-label="How it works">
							{content.flow.map((part, index) => (
								<li key={part}>
									<span className={index === 1 ? "guide-highlight" : ""}>
										{part}
									</span>
									{index < content.flow.length - 1 && <b aria-hidden="true">→</b>}
								</li>
							))}
						</ol>
						<div className="guide-setting-list">
							{content.settings.map((setting, index) => (
								<section key={setting.label}>
									<span className="guide-number">{index + 1}</span>
									<div>
										<h2>
											{setting.label}
											<strong>{setting.value}</strong>
										</h2>
										<p>{setting.why}</p>
									</div>
								</section>
							))}
						</div>
						<aside className="guide-tip">{content.tip}</aside>
						{content.action && (
							<button
								className="guide-settings-link"
								onClick={() => void openSettings()}
							>
								{content.action.label} ↗
							</button>
						)}
						{error && <p role="alert">{error}</p>}
					</>
				) : (
					<>
						<p className="guide-eyebrow">Guide complete</p>
						<h1 ref={heading} tabIndex={-1}>
							Ready for a short test
						</h1>
						<p className="guide-lead">
							{track === "record"
								? "Record ten seconds, speak and play one sound, then check the result in the editor."
								: "Speak and play one sound. Check the receiving app's meter and listen to its microphone test before going live."}
						</p>
						<aside className="guide-tip">
							The guide has not changed settings, started recording or started a
							stream. You choose when to begin.
						</aside>
						<button className="guide-primary" onClick={() => window.close()}>
							Done
						</button>{" "}
						<button onClick={() => setTrack(undefined)}>View other guide</button>
					</>
				)}
			</div>
			{track && content && (
				<footer>
					<button
						disabled={step === 0}
						onClick={() => {
							setStep(step - 1);
							save(step - 1);
						}}
					>
						Back
					</button>
					<span>Settings can be changed any time.</span>
					<button
						className="guide-primary"
						onClick={() => {
							setStep(step + 1);
							save(step + 1);
						}}
					>
						{step === 3 ? "Finish guide" : "Next"} →
					</button>
				</footer>
			)}
		</main>
	);
}
