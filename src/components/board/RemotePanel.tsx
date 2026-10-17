import { TabletDownloads } from './TabletDownloads';
import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardAPI } from "../../types/board";
import type { RemoteAction, RemoteInfo, RemoteSnapshot } from "../../types/remote";
import { mergeRemoteSnapshot } from "./remoteSnapshot";
import { companionTransport } from "./transport";
import { TabletRecordBar } from "./TabletRecordBar";
import "./board.css";
import "./remote.css";

export function RemotePanel({ transport: supplied }: { transport?: BoardAPI }) {
	const [connection, setConnection] = useState("Connecting…");
	const transport = useMemo(() => supplied ?? companionTransport(setConnection), [supplied]);
	const [info, setInfo] = useState<RemoteInfo>();
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const pending = useRef(false);
	const [voices, setVoices] = useState<{
		selected: string;
		voices: { id: string; name: string }[];
	}>();
	useEffect(() => {
		let live = true;
		let hasCatalog = false;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async (catalog = false) => {
			try {
				const next = await transport.request<RemoteSnapshot>(
					"remoteInfo",
					catalog || !hasCatalog ? undefined : "live",
				);
				if (live) {
					if (next.memes && next.sounds) hasCatalog = true;
					setInfo((old) => mergeRemoteSnapshot(old, next));
					setConnection("Connected");
				}
			} catch (e) {
				if (live) setConnection(String(e));
			}
		};
		const tick = async () => {
			await poll();
			if (live) timer = setTimeout(tick, 1000);
		};
		void poll(true).then(() => {
			if (live) timer = setTimeout(tick, 1000);
		});
		const off = transport.on("connected", () => void poll(true));
		const disconnected = transport.on("disconnected", () => {
			hasCatalog = false;
			setConnection("Disconnected — reconnect on this device");
			setInfo(undefined);
		});
		return () => {
			live = false;
			clearTimeout(timer);
			off();
			disconnected();
		};
	}, [transport]);
	async function run(action: RemoteAction) {
		if (pending.current) return;
		pending.current = true;
		setBusy(true);
		setError("");
		try {
			const next = await transport.request<RemoteInfo>("remoteAction", action);
			setInfo((old) => mergeRemoteSnapshot(old, next));
		} catch (e) {
			setError(String(e));
		} finally {
			pending.current = false;
			setBusy(false);
		}
	}
	async function loadVoices() {
		try {
			setVoices(await transport.request("recordingVoices"));
		} catch (e) {
			setError(String(e));
		}
	}
	const ready = connection === "Connected" && !!info;
	const pick = (kind: "sound" | "meme", id: string) => {
		const armed = info?.armed;
		void run(
			armed?.kind === kind && armed.id === id
				? { action: "deploy", token: armed.token }
				: { action: "stage", kind, id },
		);
	};
	return (
		<main className="companion-shell remote-shell">
			<header className="companion-header">
				<strong>MistaRecorda Remote</strong>
				<span>{connection}</span>
				<button onClick={() => void transport.request("reconnect")}>Reconnect</button>
				<a href="/">Canvas & notes</a>
			<TabletDownloads transport={transport}/></header>
			<div className="remote-content">
				<p className="remote-current">
					Scene:{" "}
					<strong>
						{info?.scenes.find((s) => s.id === info.sceneId)?.name ?? "Current screen"}
					</strong>
				</p>
				{error && <p role="alert">{error}</p>}
				<section aria-label="Scene controls">
					<h2>Scenes</h2>
					<div className="remote-grid">
						{info?.scenes.map((scene) => (
							<button
								key={scene.id}
								disabled={!ready || busy}
								aria-pressed={scene.id === info.sceneId}
								onClick={() => void run({ action: "scene", id: scene.id })}
							>
								{scene.name}
								{scene.camera && <small>Includes facecam</small>}
							</button>
						))}
					</div>
					<p>Scenes use the sources and camera choices saved on your Mac.</p>
				</section>
				<section aria-label="Presenter controls">
					<h2>Present</h2>
					<div className="remote-grid">
						<button
							disabled={!ready || busy}
							aria-pressed={info?.camera ?? false}
							onClick={() => void run({ action: "camera", enabled: !info?.camera })}
						>
							Facecam <strong>{info?.camera ? "On" : "Off"}</strong>
						</button>
						<button
							disabled={!ready || busy || !info?.zoomAvailable}
							aria-pressed={info?.zoom ?? false}
							onClick={() => void run({ action: "zoom", enabled: !info?.zoom })}
						>
							Zoom <strong>{info?.zoom ? "Out" : "In"}</strong>
						</button>
						<button
							disabled={!ready || busy}
							aria-pressed={info?.whiteboard ?? false}
							onClick={() =>
								void run({ action: "whiteboard", enabled: !info?.whiteboard })
							}
						>
							Whiteboard <strong>{info?.whiteboard ? "Close" : "Open"}</strong>
						</button>
						<button disabled={!ready || busy} onClick={() => void loadVoices()}>
							Voice choices
						</button>
					</div>
					{voices && (
						<label>
							Voice{" "}
							<select
								aria-label="Presentation voice"
								value={voices.selected}
								disabled={!ready || busy}
								onChange={async (e) => {
									await run({ action: "voice", id: e.target.value });
									await loadVoices();
								}}
							>
								<option value="">Original voice</option>
								{voices.voices.map((v) => (
									<option key={v.id} value={v.id}>
										{v.name}
									</option>
								))}
							</select>
						</label>
					)}
				</section>
				{info?.armed && (
					<aside className="remote-armed" aria-label="Staged reference">
						<strong>Private preview: {info.armed.name}</strong>
						{info.armed.preview && (
							<img src={info.armed.preview} alt={info.armed.name} />
						)}
						<p>
							Ready to{" "}
							{info.armed.kind === "sound"
								? "play on the Mac"
								: "place in the center of the presentation"}
							. Tap again or Deploy.
						</p>
						<button
							disabled={!ready || busy}
							onClick={() => void run({ action: "deploy", token: info.armed!.token })}
						>
							Deploy {info.armed.name}
						</button>
						<button disabled={busy} onClick={() => void run({ action: "cancelStage" })}>
							Cancel
						</button>
					</aside>
				)}
				<section aria-label="Favorite sounds">
					<h2>Favorite sounds</h2>
					<div className="remote-grid">
						{info?.sounds?.map((sound) => (
							<button
								key={sound.id}
								disabled={!ready || busy}
								aria-pressed={info?.armed?.id === sound.id}
								style={{ borderLeft: `5px solid ${sound.color}` }}
								onClick={() => pick("sound", sound.id)}
							>
								♫ {sound.name}
							</button>
						))}
					</div>
					{!info?.sounds?.length && (
						<p>Star or love sounds in the Soundboard to keep them here.</p>
					)}
				</section>
				<section aria-label="Favorite memes">
					<h2>Favorite memes</h2>
					<div className="remote-grid">
						{info?.memes?.map((m) => (
							<button
								key={m.id}
								disabled={!ready || busy}
								aria-pressed={info?.armed?.id === m.id}
								onClick={() => pick("meme", m.id)}
							>
								<img src={m.dataURL} alt="" />
								{m.name}
								{m.soundId && <small>♫ Contains audio</small>}
							</button>
						))}
					</div>
					{!info?.memes?.length && (
						<p>Star or love memes in the Meme board to keep them here.</p>
					)}
				</section>
				<button
					disabled={!ready || busy}
					onClick={() =>
						void transport
							.request<RemoteInfo>("remoteInfo")
							.then(setInfo)
							.catch((e) => setError(String(e)))
					}
				>
					Refresh favorites
				</button>
				<p>
					First tap stages privately; second tap deploys. Use Canvas & notes for precise
					placement, drawing and PDFs.
				</p>
			</div>
			<TabletRecordBar transport={transport} />
		</main>
	);
}
