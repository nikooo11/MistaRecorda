import { useEffect, useState } from "react";
import { MicrophoneIcon, SparkleIcon, XIcon, StopIcon } from "@phosphor-icons/react";
import type { BoardAPI } from "../../types/board";
import type { FigureState } from "../../types/figures";
import type { MemeAsset } from "../../types/memes";
import { MemePreviewButton } from "./MemePreviewButton";
import type { ChartImport } from "./charts/ChartPanel";
export function FigureAssistant({
	transport,
	onClose,
	memes,
	onChooseMeme,
	onCreateChart,
}: {
	onCreateChart?: (source: ChartImport | undefined) => void;
	transport: BoardAPI;
	onClose: () => void;
	memes: MemeAsset[];
	onChooseMeme: (asset: MemeAsset) => void;
}) {
	const [state, setState] = useState<FigureState>();
	const [topic, setTopic] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [prompts, setPrompts] = useState<Record<string, string>>({});
	const [expand, setExpand] = useState("");
	const run = async (method: string, input?: unknown) => {
		setBusy(true);
		setError("");
		try {
			const result = await transport.request(method, input);
			if (result && typeof result === "object" && "phase" in result)
				setState(result as FigureState);
			return result;
		} catch (e) {
			setError(e instanceof Error ? e.message : "Request failed");
		} finally {
			setBusy(false);
		}
	};
	useEffect(() => {
		let live = true;
		let lastTopic = "";
		const update = (next: FigureState) => {
			if (!live) return;
			setState(next);
			if (next.topic !== lastTopic) {
				lastTopic = next.topic;
				setTopic(next.topic);
			}
		};
		void transport
			.request<FigureState>("aiInfo")
			.then(update)
			.catch((e) => setError(String(e)));
		const off = transport.on<FigureState>("figures", update);
		return () => {
			live = false;
			off();
		};
	}, [transport]);
	const [, tick] = useState(0);
	useEffect(() => {
		if (state?.phase !== "listening") return;
		const timer = setInterval(() => tick((n) => n + 1), 1000);
		return () => clearInterval(timer);
	}, [state?.phase]);
	const working = !!state && ["searching", "transcribing", "generating"].includes(state.phase);
	const listening = state?.phase === "listening";
	return (
		<aside className="board-tray figure-tray" role="dialog" aria-label="AI figures">
			<header>
				<strong>
					<SparkleIcon size={16} /> AI figures
				</strong>
				<button
					aria-label="Close AI figures"
					onClick={() => {
						if (listening) void run("aiCancel");
						onClose();
					}}
				>
					<XIcon size={16} />
				</button>
			</header>
			{!state?.hasKey ? (
				<p>Add your OpenAI key on the Mac in Capture settings → Setup.</p>
			) : (
				<>
					<div className="figure-input">
						<textarea
							aria-label="Topic or question"
							placeholder="What are you explaining? Add dates or a question…"
							value={topic}
							onChange={(e) => setTopic(e.target.value)}
							maxLength={2000}
							rows={3}
						/>
						<div className="figure-actions">
							<button
								disabled={busy || working}
								aria-pressed={listening}
								onClick={() => void run(listening ? "aiStopListening" : "aiListen")}
								title="Listen through the Mac’s microphone for up to 20 seconds. Tap again to transcribe."
							>
								{listening ? <StopIcon size={17} /> : <MicrophoneIcon size={17} />}{" "}
								{listening ? "Finish listening" : "Mac mic"}
							</button>
							<button
								disabled={busy || working || listening || !topic.trim()}
								onClick={() => void run("aiSearch", topic.trim())}
							>
								Find visuals
							</button>
						</div>
						<small>
							{listening
								? `Listening on Mac · ${Math.floor((Date.now() - (state?.started ?? 0)) / 1000)}s`
								: "Type, use iPad keyboard dictation, or listen via Mac mic. Sent to OpenAI only when requested."}
						</small>
						<small>
							Suggests links, charts and memes. Meme names, tags and hints are
							included in your search; the GIF files stay on your devices.
						</small>
					</div>
					{working && (
						<p role="status">
							{state?.phase === "searching"
								? "Researching sources…"
								: state?.phase === "generating"
									? "Generating illustration…"
									: "Transcribing…"}{" "}
							<button onClick={() => void run("aiCancel")}>Cancel</button>
						</p>
					)}
					{state?.preview && (
						<div className="figure-preview">
							<img
								src={state.preview.dataURL}
								alt="AI-generated illustration preview"
							/>
							<small>AI-generated illustration · Preview only</small>
							<button
								disabled={busy}
								onClick={() =>
									void run("aiSaveGenerated").then(
										(v) =>
											v &&
											setError(
												"Saved privately in Standby images and Notes → Objects. Place it when ready.",
											),
									)
								}
							>
								Save to standby images
							</button>
						</div>
					)}
					{state?.results.map((result) => {
						if (result.kind === "meme") {
							const asset = memes.find((m) => m.id === result.memeId);
							return asset ? (
								<article className="figure-result" key={result.id}>
									<span className="figure-kind">Meme · Your library</span>
									<MemePreviewButton
										asset={asset}
										disabled={busy}
										onClick={() => {
											onChooseMeme(asset);
											onClose();
										}}
									/>
									<p>{result.summary}</p>
									<small>
										{asset.soundId ? "Contains audio · " : "No audio · "}Tap the
										preview, then place it on the screen or whiteboard.
									</small>
								</article>
							) : null;
						}
						return (
							<article className="figure-result" key={result.id}>
								<span className="figure-kind">
									{result.kind === "broll" ? "B-roll" : result.kind} ·{" "}
									{result.source}
								</span>
								<strong>{result.title}</strong>
								<p>{result.summary}</p>
								<small>{result.usage}</small>
								<div className="figure-actions">
									<button
										disabled={busy}
										title="Save this webpage or video link and a source note privately in Notes → Objects. Nothing is shown in the recording."
										onClick={() =>
											void run("aiSaveSource", result.id).then(
												(v) =>
													v &&
													setError(
														"Saved source and context in Notes → Objects. Use @ to attach them to a talking point.",
													),
											)
										}
									>
										Save source
									</button>
									<button
										disabled={busy}
										onClick={() => void run("aiOpen", result.id)}
									>
										Chrome link ↗
									</button>
									{onCreateChart &&
										(result.kind === "chart" || result.kind === "figure") && (
											<button
												disabled={busy}
												title="Turn this source into an editable, sourced chart. You review every value before it can be shown."
												onClick={() =>
													void (async () => {
														if (result.imageUrl) {
															const source = await run(
																"aiChartSource",
																result.id,
															);
															if (source)
																onCreateChart(
																	source as ChartImport,
																);
														} else {
															// No verified image: open the source and guide a screen capture instead.
															await run("aiOpen", result.id);
															onCreateChart(undefined);
															setError(
																"Opened the source in Chrome. Scroll to the chart, then in AI Chart choose Capture Mac screen and crop it.",
															);
														}
													})()
												}
											>
												Create editable chart
											</button>
										)}
									{result.imageUrl && (
										<button
											disabled={busy}
											onClick={() =>
												void run("aiSaveImage", result.id).then(
													(v) =>
														v &&
														setError(
															"Saved privately in Standby images and Notes → Objects. Place it when ready.",
														),
												)
											}
										>
											Save image
										</button>
									)}
									{result.prompt && (
										<button
											disabled={working || listening}
											aria-expanded={expand === result.id}
											onClick={() =>
												setExpand(expand === result.id ? "" : result.id)
											}
										>
											Illustrate…
										</button>
									)}
								</div>
								{expand === result.id && (
									<div>
										<textarea
											aria-label={`Image prompt for ${result.title}`}
											value={prompts[result.id] ?? result.prompt}
											maxLength={2000}
											onChange={(e) =>
												setPrompts({
													...prompts,
													[result.id]: e.target.value,
												})
											}
										/>
										<button
											disabled={busy || working || listening}
											onClick={() =>
												void run("aiGenerate", {
													id: result.id,
													prompt: prompts[result.id] ?? result.prompt,
												})
											}
										>
											Generate preview
										</button>
										<small>
											Uses your OpenAI image credits. Import only when ready.
										</small>
									</div>
								)}
							</article>
						);
					})}
				</>
			)}
			{(error || state?.error) && (
				<p className="board-error" role="status">
					{error || state?.error}
				</p>
			)}
			{state?.cleanupWarning && (
				<p>
					{state.cleanupWarning}
					<button onClick={() => void run("aiCleanup")}>Retry cleanup</button>
				</p>
			)}
		</aside>
	);
}
