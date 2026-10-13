import { BoardCamera } from "./BoardCamera";
import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { BoardCanvas } from "./BoardCanvas";
import { desktopBoard } from "./transport";
import type { BoardInfo, BoardStatus } from "../../types/board";
import { BoardStream } from "./BoardStream";
import "./board.css";
export function BoardWindow({ kind }: { kind: string }) {
	const transport = useMemo(desktopBoard, []);
	const [info, setInfo] = useState<BoardInfo>();
	const [error, setError] = useState("");
	const [qr, setQr] = useState("");
	const [pairUrl, setPairUrl] = useState("");
	const [name, setName] = useState("Introduction");
	const [scenes, setScenes] = useState<string[]>([]);
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
		void run("info");
		const off = transport.on("info", setInfo);
		const status = transport.on("status", (status: BoardStatus) =>
			setInfo((i) => (i ? { ...i, status } : i)),
		);
		const fail = transport.on("error", setError);
		return () => {
			off();
			status();
			fail();
		};
	}, [transport, run]);
	const preferredUrl = info?.pairing?.urls[0] ?? "";
	useEffect(() => {
		setPairUrl(preferredUrl);
	}, [preferredUrl]);
	useEffect(() => {
		if (pairUrl) void QRCode.toDataURL(pairUrl, { width: 300, margin: 2 }).then(setQr);
		else setQr("");
	}, [pairUrl]);
	if (kind === "board-hint")
		return <p className="board-hint">Press Space to open drawing board</p>;
	if (kind === "board-stream") return <BoardStream transport={transport} />;
	if (!info) return <div className="board-panel">{error || "Opening drawing board…"}</div>;
	if (kind === "board-surface" || kind === "board-editor")
		return (
			<>
				<BoardCanvas
					transport={transport}
					initial={info.state}
					clean={kind === "board-surface"}
				/>
				{kind === "board-surface" && (
					<BoardCamera
						visible={info.state.enabled && info.status.webcam}
						deviceId={info.status.webcamDeviceId}
					/>
				)}
			</>
		);
	const mcpConfig = info.mcp
		? `[mcp_servers.mistarecorda]\nurl = "${info.mcp.url}"\nbearer_token_env_var = "MISTARECORDA_MCP_TOKEN"`
		: "";
	return (
		<main className="board-panel">
			<header>
				<h1>Drawing board</h1>
				<button onClick={() => window.close()} aria-label="Hide presenter panel">
					×
				</button>
			</header>
			<div className="board-status" data-recording={info.status.recording}>
				{info.status.recording
					? info.status.paused
						? "Paused"
						: "● Recording"
					: "Not recording"}{" "}
				· {Math.floor(info.status.elapsed / 60)}:
				{String(info.status.elapsed % 60).padStart(2, "0")}
			</div>
			<div>
				<button onClick={() => void run("control", "record")}>
					{info.status.recording ? "Stop recording" : "Start recording"}
				</button>
				<button
					disabled={!info.status.recording}
					onClick={() => void run("control", "pause")}
				>
					{info.status.paused ? "Resume" : "Pause"}
				</button>
				<button onClick={() => void run("control", "webcam")}>
					{info.status.webcam ? "Hide webcam" : "Show webcam"}
				</button>
			</div>
			<p>Ctrl/⌘ + Shift + R: start/stop · P: pause/resume · W: webcam</p>
			<label>
				<input
					type="checkbox"
					checked={info.state.enabled}
					disabled={info.status.recording}
					onChange={(e) => void run("enable", e.target.checked)}
				/>{" "}
				Enable drawing overlay
			</label>
			<button onClick={() => void run("edit")}>Draw on computer</button>
			<button
				onClick={() =>
					void run("mode", { mode: info.state.mode === "board" ? "screen" : "board" })
				}
			>
				{info.state.mode === "board" ? "Return to screen" : "Open opaque board"}
			</button>
			<p>
				Move to the far-left edge, then press Space to open the board. Drawings stay until
				you clear them. Pinch zoom is shared with the recording.
			</p>
			<label>
				Display{" "}
				<select
					disabled={info.status.recording}
					value={info.displayId}
					onChange={(e) => void run("display", Number(e.target.value))}
				>
					{info.displays.map((d) => (
						<option value={d.id} key={d.id}>
							{d.name}
						</option>
					))}
				</select>
			</label>
			<label>
				Recording shows{" "}
				<select
					value={info.state.output}
					onChange={(e) => void run("output", e.target.value)}
				>
					<option value="screen-board">Screen and drawing overlay</option>
					<option value="screen">Screen only</option>
					<option value="board">Opaque board only</option>
				</select>
			</label>
			<p>
				Select this same full display in the recorder. Drawing tools and this presenter
				panel are excluded from native Mac/Windows capture.
			</p>
			<h2>Prepared scenes</h2>
			<input aria-label="Scene name" value={name} onChange={(e) => setName(e.target.value)} />
			<button onClick={() => void run("saveScene", { name })}>Save scene</button>
			<button
				onClick={() =>
					void run("listScenes").then((v) => Array.isArray(v) && setScenes(v as string[]))
				}
			>
				Browse scenes
			</button>
			{scenes.map((n) => (
				<button
					key={n}
					onClick={() => {
						if (
							confirm(
								`Load “${n}” in place of the current scene? Save your current scene first if needed.`,
							)
						)
							void run("loadScene", { name: n });
					}}
				>
					{n}
				</button>
			))}
			<h2>Connect iPad</h2>
			<p>Use the same Wi-Fi. Scan, then approve your device below.</p>
			<button onClick={() => void run("pair")}>
				{info.pairing ? "New QR code" : "Show pairing QR"}
			</button>
			{info.pairing && <button onClick={() => void run("stopPairing")}>Stop sharing</button>}
			{qr && (
				<>
					<img className="board-qr" src={qr} alt="Scan to pair your drawing device" />
					<select
						aria-label="Network address"
						value={pairUrl}
						onChange={(e) => setPairUrl(e.target.value)}
					>
						{info.pairing?.urls.map((u) => (
							<option key={u} value={u}>
								{u.split("/#")[0]}
							</option>
						))}
					</select>
					<p>
						QR code expires after five minutes. Choose your Wi-Fi address if more than
						one is listed.
					</p>
				</>
			)}
			{info.devices.map((d) => (
				<div key={d.id}>
					{d.name} ·{" "}
					{d.connected
						? d.approved
							? "Connected"
							: "Awaiting approval"
						: "Disconnected"}
					{!d.approved && (
						<button onClick={() => void run("approve", d.id)}>Approve</button>
					)}
					<button onClick={() => void run("disconnect", d.id)}>Disconnect</button>
				</div>
			))}
			<h2>Codex / MCP</h2>
			<button onClick={() => void run("mcp", !info.mcp)}>
				{info.mcp ? "Disable MCP" : "Enable MCP drawing tools"}
			</button>
			{info.mcp && (
				<>
					<p>
						For Codex on this computer, add this to its MCP configuration and set
						MISTARECORDA_MCP_TOKEN to the session token below. Connections reset when
						the app restarts. Read the included drawing guide through MCP before
						drawing.
					</p>
					<textarea
						aria-label="Codex MCP configuration"
						rows={4}
						readOnly
						value={mcpConfig}
					/>
					<input
						type="password"
						aria-label="MCP session token"
						readOnly
						value={info.mcp.token}
					/>
					<button onClick={() => void navigator.clipboard.writeText(info.mcp!.token)}>
						Copy token
					</button>
					<p>
						Cloud clients need an authenticated connection to this computer. This button
						does not publish your board to the internet.
					</p>
				</>
			)}
			{error && <p role="alert">{error}</p>}
		</main>
	);
}
