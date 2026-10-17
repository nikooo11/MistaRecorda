import { useEffect, useState } from "react";
import {
	chapterText,
	defaultUploadMetadata,
	YOUTUBE_WAITING,
	type PublishingInfo,
	type UploadMetadata,
	type UploadMarker,
} from "../../types/publishing";
import "./publishing.css";
const request = <T,>(method: string, input?: unknown) =>
	window.electronAPI.studio.request<T>("youtube:" + method, input);
function usePublishing() {
	const [info, setInfo] = useState<PublishingInfo>();
	const [error, setError] = useState("");
	useEffect(() => {
		let alive = true;
		const read = () =>
			request<PublishingInfo>("info")
				.then((v) => {
					if (alive) setInfo(v);
				})
				.catch(() => {
					if (alive) setError("Could not read YouTube status.");
				});
		void read();
		const timer = setInterval(() => void read(), 1000);
		return () => {
			alive = false;
			clearInterval(timer);
		};
	}, []);
	const run = async (method: string, input?: unknown) => {
		setError("");
		try {
			setInfo(await request<PublishingInfo>(method, input));
		} catch (e) {
			setError(e instanceof Error ? e.message : "YouTube action failed.");
		}
	};
	return { info, error, run, setError };
}
function Notice({ info }: { info?: PublishingInfo }) {
	return !info?.approved ? (
		<p className="youtube-notice">
			Google testing mode: only listed test users can connect, and Google may show an
			“unverified app” warning. Uploads stay Private until MistaRecorda’s YouTube approval is
			complete. You can change visibility in YouTube Studio.{" "}
			{!info?.available &&
				"Connection is unavailable until the developer configures Google OAuth."}
		</p>
	) : null;
}
export function YouTubeConnection() {
	const { info, error, run } = usePublishing();
	const busy = info?.progress.phase === "connecting" || info?.progress.phase === "uploading";
	return (
		<section className="api-key-card publishing">
			<h3>{info?.status ?? YOUTUBE_WAITING}</h3>
			<Notice info={info} />
			<p>
				Connect in your browser. Your connection stays encrypted on this computer until you
				disconnect or Google revokes it.
			</p>
			<div className="publishing-actions">
				<button
					disabled={!info?.available || busy}
					onClick={() => void run("connect", { captions: false })}
				>
					{info?.connected ? "Reconnect YouTube" : "Connect YouTube"}
				</button>
				<button disabled={!info?.connected || busy} onClick={() => void run("disconnect")}>
					Disconnect
				</button>
				{busy && <button onClick={() => void run("cancel")}>Cancel</button>}
			</div>
			<p role="status">
				{error ||
					info?.progress.error ||
					(info?.connected ? "Connected to YouTube." : "Not connected.")}
			</p>
		</section>
	);
}
type Cue = { startMs: number; endMs: number; text: string };
export function YouTubeUploadPanel({
	file,
	project,
	source,
	markers,
	durationMs,
	cues,
	mapTime,
	onClose,
}: {
	file: string;
	project: string;
	source: string;
	markers: UploadMarker[];
	durationMs: number;
	cues: Cue[];
	mapTime: (time: number) => number;
	onClose: () => void;
}) {
	const { info, error, run, setError } = usePublishing();
	const [metadata, setMetadata] = useState<UploadMetadata>({
		...defaultUploadMetadata,
		title:
			file
				.split(/[\\/]/)
				.pop()
				?.replace(/\.mp4$/i, "") || "My presentation",
	});
	const [thumbnail, setThumbnail] = useState("");
	const [captions, setCaptions] = useState(false);
	const [notice, setNotice] = useState("");
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		let alive = true;
		void Promise.all([
			request<UploadMetadata>("preset", { key: project || source || file }),
			source ? request<UploadMarker[]>("markers", source) : Promise.resolve([]),
		])
			.then(([preset, recorded]) => {
				if (!alive) return;
				setMetadata({
					...preset,
					title:
						preset.title === "My presentation"
							? file
									.split(/[\\/]/)
									.pop()
									?.replace(/\.mp4$/i, "") || preset.title
							: preset.title,
					chapters:
						preset.chapters ||
						chapterText(
							[
								...markers,
								...recorded.map((m) => ({ ...m, timeMs: mapTime(m.timeMs) })),
							],
							durationMs,
						),
				});
			})
			.catch(() => {
				if (alive) setError("Could not load upload presets. You can enter details below.");
			})
			.finally(() => {
				if (alive) setLoading(false);
			});
		return () => {
			alive = false;
		};
	}, [file, project, source]);
	const patch = (value: Partial<UploadMetadata>) => setMetadata((m) => ({ ...m, ...value }));
	const busy = info?.progress.phase === "connecting" || info?.progress.phase === "uploading";
	const saveCaptions = async () => {
		try {
			const saved = await request<boolean>("saveCaptions", cues);
			if (saved) setNotice("SRT saved. Add it in YouTube Studio → Subtitles.");
		} catch {
			setError("Could not save captions.");
		}
	};
	return (
		<div className="publishing-backdrop">
			<section
				className="publishing publishing-panel"
				role="dialog"
				aria-modal="true"
				aria-label="YouTube upload"
			>
				<header>
					<h2>{info?.status ?? YOUTUBE_WAITING}</h2>
					<button onClick={onClose} aria-label="Close YouTube upload">
						Close
					</button>
				</header>
				<Notice info={info} />
				{!info?.connected && (
					<button
						disabled={!info?.available || busy}
						onClick={() => void run("connect", { captions: false })}
					>
						Connect YouTube
					</button>
				)}
				<fieldset disabled={busy || loading}>
					<label>
						Title
						<input
							value={metadata.title}
							maxLength={100}
							onChange={(e) => patch({ title: e.target.value })}
						/>
					</label>
					<label>
						Description
						<textarea
							value={metadata.description}
							maxLength={5000}
							onChange={(e) => patch({ description: e.target.value })}
						/>
					</label>
					<label>
						Tags, separated by commas
						<input
							value={metadata.tags.join(",")}
							onChange={(e) => patch({ tags: e.target.value.split(",") })}
						/>
					</label>
					<div className="publishing-fields">
						<label>
							Privacy
							<select
								value={info?.approved ? metadata.privacy : "private"}
								disabled={!info?.approved}
								onChange={(e) =>
									patch({ privacy: e.target.value as UploadMetadata["privacy"] })
								}
							>
								<option value="private">Private</option>
								{info?.approved && (
									<>
										<option value="unlisted">Unlisted</option>
										<option value="public">Public</option>
									</>
								)}
							</select>
						</label>
						<label>
							Category
							<select
								value={metadata.categoryId}
								onChange={(e) => patch({ categoryId: e.target.value })}
							>
								<option value="27">Education</option>
								<option value="22">People & blogs</option>
								<option value="28">Science & technology</option>
								<option value="20">Gaming</option>
								<option value="24">Entertainment</option>
								<option value="26">How-to & style</option>
							</select>
						</label>
					</div>
					<label className="publishing-check">
						<input
							type="checkbox"
							checked={metadata.madeForKids}
							onChange={(e) => patch({ madeForKids: e.target.checked })}
						/>
						Made for kids
					</label>
					<label>
						Chapters
						<textarea
							value={metadata.chapters}
							onChange={(e) => patch({ chapters: e.target.value })}
						/>
					</label>
					<small>
						Drafted from scene changes, zooms and covered talking points. Edit the
						labels before uploading. YouTube chapters need at least 3 entries, starting
						at 00:00, with at least 10 seconds each.
					</small>
					<div className="publishing-actions">
						<button
							onClick={() =>
								void request<string | null>("thumbnail")
									.then((f) => {
										if (f) setThumbnail(f);
									})
									.catch(() => setError("Could not choose thumbnail."))
							}
						>
							Choose thumbnail
						</button>
						{thumbnail && (
							<button onClick={() => setThumbnail("")}>Remove thumbnail</button>
						)}
					</div>
					{thumbnail && <p>{thumbnail.split(/[\\/]/).pop()}</p>}
					{cues.length > 0 && (
						<>
							<label className="publishing-check">
								<input
									type="checkbox"
									checked={captions}
									onChange={(e) => setCaptions(e.target.checked)}
								/>
								Attach captions as a separate subtitle track
							</label>
							<label>
								Caption language
								<input
									value={metadata.language}
									onChange={(e) => patch({ language: e.target.value })}
								/>
							</label>
							{captions && !info?.captionPermission && (
								<p>
									Turn off “Attach captions as a separate subtitle track” to
									upload with your current permission. Captions already visible in
									the exported video stay intact. You can save an SRT to add in
									YouTube Studio, or reconnect with the broader permission to
									manage YouTube videos.
									<button
										disabled={!info?.available}
										onClick={() => void run("connect", { captions: true })}
									>
										Reconnect with captions permission
									</button>
								</p>
							)}
							<button onClick={() => void saveCaptions()}>
								Save captions as SRT
							</button>
						</>
					)}
					<button
						onClick={() =>
							void request("preset", {
								key: project || source || file,
								metadata: {
									...metadata,
									tags: metadata.tags.map((t) => t.trim()).filter(Boolean),
								},
							})
								.then(() => setNotice("Upload details saved for this project."))
								.catch(() => setError("Check your metadata before saving."))
						}
					>
						Save details for this project
					</button>
				</fieldset>
				<p role="status">{error || info?.progress.error || notice}</p>
				{info?.progress.phase === "uploading" && (
					<>
						<progress
							value={info.progress.uploaded}
							max={Math.max(1, info.progress.total)}
						/>
						<p>
							Uploading{" "}
							{Math.round(
								(info.progress.uploaded / Math.max(1, info.progress.total)) * 100,
							)}
							%
						</p>
					</>
				)}
				{info?.progress.warnings.map((w) => (
					<p key={w}>{w}</p>
				))}
				{info?.progress.videoUrl && (
					<a href={info.progress.videoUrl} target="_blank" rel="noreferrer">
						Open uploaded video on YouTube
					</a>
				)}
				<footer className="publishing-actions">
					{busy ? (
						<button onClick={() => void run("cancel")}>
							Cancel {info?.progress.phase === "connecting" ? "connection" : "upload"}
						</button>
					) : (
						<>
							<button
								disabled={
									!info?.connected ||
									!info.available ||
									loading ||
									!metadata.title.trim() ||
									(captions && !info.captionPermission)
								}
								onClick={() =>
									void run("start", {
										file,
										metadata: {
											...metadata,
											tags: metadata.tags
												.map((t) => t.trim())
												.filter(Boolean),
										},
										thumbnail: thumbnail || undefined,
										cues: captions ? cues : undefined,
									})
								}
							>
								Upload {info?.approved ? metadata.privacy : "Private"} video
							</button>
							{info?.progress.canRetry && (
								<button onClick={() => void run("retry")}>
									Retry remaining upload
								</button>
							)}
						</>
					)}
				</footer>
				<small>
					Only Upload sends your video. Closing this panel keeps an active upload running;
					Cancel stops it.
				</small>
			</section>
		</div>
	);
}
