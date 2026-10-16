import {
	ArrowLeftIcon,
	ArrowsOutSimpleIcon,
	DeviceTabletIcon,
	GearSixIcon,
	PauseIcon,
	PencilSimpleIcon,
	PlayIcon,
	QrCodeIcon,
	RecordIcon,
	SparkleIcon,
	StackIcon,
	WebcamIcon,
	XIcon,
} from "@phosphor-icons/react";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardInfo, BoardStatus } from "../../types/board";
import { EnvironmentFiles } from "./EnvironmentFiles";
import { BoardCanvas } from "./BoardCanvas";
import { BoardStream } from "./BoardStream";
import { FigureAssistant } from "./FigureAssistant";
import { FigureMicrophone } from "./FigureMicrophone";
import { MemeLibrary } from "./Memes";
import { Soundboard } from "./Soundboard";
import { desktopBoard } from "./transport";
import "./board.css";

export function BoardWindow({ kind }: { kind: string }) {
	const transport = useMemo(desktopBoard, []);
	const [info, setInfo] = useState<BoardInfo>();
	const [error, setError] = useState("");
	const [qr, setQr] = useState("");
	const [pairUrl, setPairUrl] = useState("");
	const [name, setName] = useState("Introduction");
	const [scenes, setScenes] = useState<string[]>([]);
	const [compact, setCompact] = useState(false);
	const [ai, setAi] = useState(false);
	const [soundTab, setSoundTab] = useState<"sounds" | "voices">("sounds");
	const [memes, setMemes] = useState(false);
	const [sounds, setSounds] = useState(false);
	const [tab, setTab] = useState<"draw" | "ipad" | "scenes" | "settings">("draw");
	const [notice, setNotice] = useState("");
	const [now, setNow] = useState(Date.now());
	const run = useCallback(
		async (method: string, input?: unknown) => {
			try {
				const value = await transport.request(method, input);
				setError("");
				if (value && typeof value === "object" && "state" in value && "devices" in value)
					setInfo(value as BoardInfo);
				return value;
			} catch (e) {
				setError(e instanceof Error ? e.message : "Operation failed");
			}
		},
		[transport],
	);
	useEffect(() => {
		void run("info").then((value) => {
			const initial = value as BoardInfo | undefined;
			if (initial?.panelTab) setTab(initial.panelTab);
		});
		const navigate = transport.on<"draw" | "ipad" | "scenes" | "settings">("navigate", setTab);
		const off = transport.on("info", setInfo);
		const status = transport.on("status", (status: BoardStatus) =>
			setInfo((i) => (i ? { ...i, status } : i)),
		);
		const fail = transport.on("error", setError);
		const showMemes = transport.on("openMemes", () => setMemes(true));
		const openRequestedPresenter = () => {
			if (kind !== "board-panel") return;
			void transport
				.request<"ai" | "voices" | "sounds" | "memes" | null>("takePresenterTool")
				.then((tool) => {
					if (!tool) return;
					setMemes(tool === "memes");
					setAi(tool === "ai");
					setSoundTab(tool === "voices" ? "voices" : "sounds");
					setSounds(tool === "sounds" || tool === "voices");
				})
				.catch((e) => setError(String(e)));
		};
		// Read once on mount as well: the desktop request can arrive before React mounts.
		const showPresenter = transport.on("openPresenter", openRequestedPresenter);
		openRequestedPresenter();

		return () => {
			navigate();
			off();
			status();
			fail();
			showMemes();
			showPresenter();
		};
	}, [transport, run, kind]);
	const preferredUrl = info?.pairing?.urls[0] ?? "";
	useEffect(() => {
		setPairUrl(preferredUrl);
	}, [preferredUrl]);
	useEffect(() => {
		let cancelled = false;
		setQr("");
		if (pairUrl)
			void QRCode.toDataURL(pairUrl, { width: 300, margin: 2 })
				.then((value) => {
					if (!cancelled) setQr(value);
				})
				.catch(() => setError("Could not create the pairing code. Try again."));
		return () => {
			cancelled = true;
		};
	}, [pairUrl]);
	useEffect(() => {
		if (!info?.pairing?.expires) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [info?.pairing?.expires]);
	if (kind === "board-hint")
		return (
			<button
				className="board-edge-handle"
				title="Open whiteboard. Shortcut: Command/Control + Shift + B."
				aria-label="Open whiteboard"
				onClick={() => void run("toggleBoard")}
			>
				<span />
				<PencilSimpleIcon size={16} />
			</button>
		);
	if (kind === "board-stream")
		return (
			<>
				<BoardStream transport={transport} />
				<FigureMicrophone transport={transport} />
			</>
		);
	if (!info)
		return (
			<div className="board-panel board-loading">{error || "Opening drawing studio…"}</div>
		);
	if (kind === "board-surface" || kind === "board-editor")
		return (
			<>
				<BoardCanvas
					transport={transport}
					initial={info.state}
					clean={kind === "board-surface"}
				/>
			</>
		);
	const expiresIn = Math.max(0, Math.ceil(((info.pairing?.expires ?? 0) - now) / 1000));
	const connected = info.devices.filter((d) => d.approved && d.connected).length;
	return (
		<main className={`board-panel ${compact ? "board-compact" : ""}`}>
			{ai && (
				<FigureAssistant
					transport={transport}
					memes={info.state.memes ?? []}
					onChooseMeme={(asset) => void run("armMeme", asset.id)}
					onClose={() => setAi(false)}
				/>
			)}
			{memes && (
				<MemeLibrary
					transport={transport}
					state={info.state}
					onChoose={(asset) => void run("armMeme", asset.id)}
					onClose={() => setMemes(false)}
				/>
			)}
			{sounds && (
				<Soundboard
					key={soundTab}
					initialTab={soundTab}
					transport={transport}
					onClose={() => setSounds(false)}
				/>
			)}
			<header className="board-panel-heading">
				<div>
					<h1>{compact ? "Recording controls" : "Drawing"}</h1>
				</div>
				<button
					className="studio-icon"
					title="Hide this panel. Your drawing and recording continue."
					onClick={() => window.close()}
					aria-label="Hide presenter panel"
				>
					<XIcon size={18} />
				</button>
			</header>
			<div className="board-status" data-recording={info.status.recording}>
				<button
					aria-expanded={memes}
					onClick={() => {
						setMemes(!memes);
						setSounds(false);
						setAi(false);
					}}
				>
					Memes
				</button>
				<button
					aria-expanded={ai}
					onClick={() => {
						setAi(!ai);
						setSounds(false);
					}}
				>
					<SparkleIcon size={16} /> AI mic
				</button>
				<button
					aria-expanded={sounds}
					onClick={() => {
						setSounds(!sounds);
						setAi(false);
					}}
				>
					Soundboard
				</button>
				<span
					className={`studio-dot ${info.status.recording && !info.status.paused ? "is-live" : ""}`}
				/>
				<span>
					{info.status.recording
						? info.status.paused
							? "Recording paused"
							: "Recording"
						: "Ready"}
				</span>
				<time>
					{Math.floor(info.status.elapsed / 60)}:
					{String(info.status.elapsed % 60).padStart(2, "0")}
				</time>
			</div>
			{!compact && (
				<>
					<nav className="studio-tabs" aria-label="Drawing studio">
						{(
							[
								{ id: "draw", label: "Draw", Icon: PencilSimpleIcon },
								{ id: "ipad", label: "iPad", Icon: DeviceTabletIcon },
								{ id: "scenes", label: "Drawings", Icon: StackIcon },
								{ id: "settings", label: "Options", Icon: GearSixIcon },
							] as const
						).map(({ id, label, Icon }) => (
							<button
								key={id}
								aria-pressed={tab === id}
								title={
									{
										draw: "Draw over your screen or open a clean whiteboard.",
										ipad: "Pair your iPad and draw over a live view of this display.",
										scenes: "Save and reopen reusable drawings.",
										settings:
											"Choose the display, recording output, and optional drawing tools.",
									}[id]
								}
								onClick={() => {
									setTab(id);
									void run("panelTab", id);
									setNotice("");
								}}
							>
								<Icon size={19} />
								{label}
								{id === "ipad" && connected > 0 && (
									<span className="connected-dot" />
								)}
							</button>
						))}
					</nav>
					<div className="board-panel-content">
						{tab === "draw" && (
							<>
								<div className="board-intro">
									<h2>Draw on your screen</h2>
									<p>
										Add drawings, circles or text over your screen, or open a
										separate whiteboard. Your mouse still clicks and types
										normally until you choose Draw.
									</p>
								</div>
								<label
									className="studio-switch-row"
									data-help="Show and record drawings, circles, text and placed objects over your screen or whiteboard. Off hides this layer on your Mac and in the recording without deleting it. Your mouse clicks and typing work normally until you choose Draw."
								>
									<span>
										<strong>Include drawings in recording</strong>
										<small>
											Shows your drawings on the Mac and records them.
										</small>
									</span>
									<input
										type="checkbox"
										role="switch"
										checked={
											info.state.enabled && info.state.output !== "screen"
										}
										disabled={info.status.recording}
										onChange={(e) => void run("enable", e.target.checked)}
									/>
								</label>
								<div className="studio-action-grid">
									<button
										className="studio-primary"
										title="Draw arrows, shapes, text, or freehand ink over your desktop. Choose Done drawing to click your apps again."
										onClick={() => void run("edit")}
									>
										<PencilSimpleIcon size={20} /> Draw on screen
									</button>
									<button
										title="Slide in a full whiteboard. Screen annotations are saved separately, so you can return to them."
										onClick={() =>
											void run("mode", {
												mode:
													info.state.mode === "board"
														? "screen"
														: "board",
											})
										}
									>
										{info.state.mode === "board" ? (
											<ArrowLeftIcon size={20} />
										) : (
											<ArrowsOutSimpleIcon size={20} />
										)}
										{info.state.mode === "board"
											? "Return to screen"
											: "Open whiteboard"}
									</button>
								</div>
								<div className="studio-tip">
									<span className="edge-gesture" aria-hidden="true">
										↦
									</span>
									<p>
										<strong>Whiteboard access</strong>Move to the far-left edge
										and click the small board tab. Put it away when you’re done;
										your drawings stay.
									</p>
								</div>
								<button
									className="studio-link"
									onClick={() => setTab("ipad")}
									title="Show a QR code to connect your iPad on the same Wi-Fi."
								>
									<DeviceTabletIcon size={18} /> Draw with your iPad{" "}
									<span>→</span>
								</button>
							</>
						)}
						{tab === "ipad" && (
							<>
								<h2>Connect iPad</h2>
								<p>
									See your computer live, then draw with Apple Pencil or your
									finger.
								</p>
								<ol className="pair-steps">
									<li>
										<span>1</span>Connect both devices to the same Wi-Fi.
									</li>
									<li>
										<span>2</span>Scan the code with your iPad camera.
									</li>
									<li>
										<span>3</span>Approve it here, then tap Start screen.
									</li>
								</ol>
								{qr ? (
									<div className="qr-card">
										<img
											className="board-qr"
											src={qr}
											alt="Scan to pair your iPad"
										/>
										<span className="qr-caption">
											{expiresIn
												? `Ready to scan · ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, "0")}`
												: "Code expired · create a new one below"}
										</span>
									</div>
								) : (
									<div className="qr-placeholder">
										<QrCodeIcon size={56} weight="light" />
										<p>Generate a code to pair a device</p>
									</div>
								)}
								<button
									className="studio-primary studio-wide"
									onClick={() => void run("pair")}
									title="Start local pairing and create a code that expires in five minutes. Only devices you approve can connect."
								>
									<QrCodeIcon size={20} />
									{info.pairing ? "New QR code" : "Show pairing QR"}
								</button>
								{info.pairing && (
									<details className="studio-details">
										<summary>Connection options</summary>
										<label className="studio-field">
											Pairing link
											<input
												readOnly
												value={pairUrl}
												onFocus={(event) => event.currentTarget.select()}
											/>
										</label>
										<label>
											Network address
											<select
												aria-label="Network address"
												value={pairUrl}
												onChange={(e) => setPairUrl(e.target.value)}
											>
												{info.pairing.urls.map((u) => (
													<option key={u} value={u}>
														{u.split("/#")[0]}
													</option>
												))}
											</select>
										</label>
										<button
											onClick={() => void run("stopPairing")}
											title="Disconnect every paired device and stop the local screen stream."
										>
											Stop sharing
										</button>
									</details>
								)}
								{info.devices.map((d) => (
									<div className="studio-device" key={d.id}>
										<DeviceTabletIcon size={24} />
										<div>
											<strong>{d.name}</strong>
											<small>
												{d.connected
													? d.approved
														? "Connected"
														: "Awaiting your approval"
													: "Disconnected"}
											</small>
										</div>
										{!d.approved && (
											<button
												className="studio-primary"
												onClick={() => void run("approve", d.id)}
												title="Allow this device to see your screen and edit drawings."
											>
												Approve
											</button>
										)}
										<button
											onClick={() => void run("disconnect", d.id)}
											title="Revoke this device’s access. It will need to pair again."
										>
											Disconnect
										</button>
									</div>
								))}
							</>
						)}
						{tab === "scenes" && (
							<>
								<h2>Saved drawings</h2>
								<p>Save the current drawing or load one you saved.</p>
								<label className="studio-field">
									Scene name
									<input
										aria-label="Scene name"
										value={name}
										onChange={(e) => setName(e.target.value)}
									/>
								</label>
								<div className="studio-action-grid">
									<button
										className="studio-primary"
										disabled={!name.trim()}
										onClick={() =>
											void run("saveScene", { name }).then((v) => {
												if (v) setNotice(`Saved “${name}”`);
											})
										}
										title="Save the current scene under this name. Using an existing name replaces that saved scene."
									>
										Save drawing
									</button>
									<button
										onClick={() =>
											void run("listScenes").then((v) => {
												if (Array.isArray(v)) {
													setScenes(v as string[]);
													if (!v.length)
														setNotice(
															"No saved drawings yet. Save your first drawing above.",
														);
												}
											})
										}
										title="List previously saved scenes so you can load one."
									>
										Browse drawings
									</button>
								</div>
								{scenes.map((n) => (
									<button
										className="studio-scene"
										key={n}
										onClick={() => {
											if (
												confirm(
													`Load “${n}” in place of the current scene? Save your current scene first if needed.`,
												)
											)
												void run("loadScene", { name: n });
										}}
										title="Replace the current canvas with this saved scene."
									>
										<StackIcon size={20} />
										{n}
										<span>↗</span>
									</button>
								))}
							</>
						)}
						{tab === "settings" && (
							<>
								<details className="studio-details">
									<summary>Presentation environments</summary>
									<EnvironmentFiles transport={transport} onError={setNotice} />
								</details>
								<button
									onClick={() =>
										void window.electronAPI.studio
											.request("open", "setup")
											.catch((e) => setNotice(String(e)))
									}
								>
									Open API Setup · OpenAI &amp; ElevenLabs
								</button>
								<h2>Drawing settings</h2>
								<label className="studio-field">
									Display
									<select
										disabled={info.status.recording}
										value={info.displayId}
										onChange={(e) =>
											void run("display", Number(e.target.value))
										}
									>
										{info.displays.map((d) => (
											<option value={d.id} key={d.id}>
												{d.name}
											</option>
										))}
									</select>
								</label>
								<label className="studio-field">
									Recording shows
									<select
										value={info.state.output}
										onChange={(e) => void run("output", e.target.value)}
									>
										<option value="screen-board">Screen and drawings</option>
										<option value="screen">Screen only</option>
										<option value="board">Whiteboard only</option>
									</select>
								</label>
								<p className="studio-note">
									Select this same full display in the recorder to include
									drawings. Your tools and presenter controls stay out of native
									Mac and Windows recordings.
								</p>
								<details className="studio-details">
									<summary>Agent presentation tools · MCP</summary>
									<p>
										Connect Codex, Claude Code or another MCP client to prepare
										both canvases, shadow notes and talking points. Agents can
										import screenshots you supply and arrange editable objects.
										Shadow objects remain private until shown on the iPad.
									</p>
									<button
										onClick={() => void run("mcp", !info.mcp)}
										title="Enable or stop the authenticated local server for compatible drawing agents."
									>
										{info.mcp ? "Disable MCP" : "Enable MCP drawing tools"}
									</button>
									{info.mcp && (
										<>
											<textarea
												aria-label="Codex MCP configuration"
												readOnly
												value={`[mcp_servers.mistarecorda]\nurl = "${info.mcp.url}"\nbearer_token_env_var = "MISTARECORDA_MCP_TOKEN"`}
											/>
											<label>
												Session token
												<input
													type="password"
													readOnly
													value={info.mcp.token}
												/>
											</label>
										</>
									)}
								</details>
							</>
						)}
						{notice && (
							<p className="studio-notice" role="status">
								{notice}
							</p>
						)}
					</div>
				</>
			)}
			{error && (
				<p className="studio-error" role="alert">
					{error}
				</p>
			)}
			<footer className="board-panel-footer">
				<div className="studio-record-controls">
					<button
						className={info.status.recording ? "studio-stop" : "studio-primary"}
						onClick={() => void run("control", "record")}
						title="Start or stop the current recording. Shortcut: Command/Control + Shift + R."
					>
						<RecordIcon size={18} weight="fill" />
						{info.status.recording ? "Stop recording" : "Record"}
					</button>
					<button
						disabled={!info.status.recording}
						onClick={() => void run("control", "pause")}
						title="Pause or resume without adding the paused time to your video. Shortcut: Command/Control + Shift + P."
					>
						{info.status.paused ? <PlayIcon size={18} /> : <PauseIcon size={18} />}{" "}
						{info.status.paused ? "Resume" : "Pause"}
					</button>
					<button
						aria-label={info.status.webcam ? "Hide webcam" : "Show webcam"}
						aria-pressed={info.status.webcam}
						onClick={() => void run("control", "webcam")}
						title="Turn the face camera on or off in your recording."
					>
						<WebcamIcon size={20} />
					</button>
				</div>
				<button
					className="studio-link compact-link"
					onClick={() => {
						setCompact(!compact);
						void run("compact", !compact);
					}}
					title="Switch between the full drawing studio and small presenter controls."
				>
					{compact ? "Expand studio" : "Compact controls"}
				</button>
			</footer>
		</main>
	);
}
