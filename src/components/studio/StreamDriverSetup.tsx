import { useCallback, useEffect, useState } from "react";
import type { StreamDriverStatus } from "../../types/streamDriver";

export function StreamDriverSetup({
	request,
	active,
}: {
	request: <T = unknown>(method: string, input?: unknown) => Promise<T>;
	active: boolean;
}) {
	const [status, setStatus] = useState<StreamDriverStatus>();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const check = useCallback(async () => {
		try {
			setStatus(await request<StreamDriverStatus>("streamDriverInfo"));
			setError("");
		} catch {
			setError("Could not check the optional audio driver. Recording is still available.");
		}
	}, [request]);
	useEffect(() => {
		void check();
		window.addEventListener("focus", check);
		return () => window.removeEventListener("focus", check);
	}, [check]);
	const install = async () => {
		setBusy(true);
		setError("");
		try {
			setStatus(await request<StreamDriverStatus>("installStreamDriver"));
		} catch (e) {
			setError(String(e).replace(/^Error:\s*/, ""));
		} finally {
			setBusy(false);
		}
	};
	return (
		<section className="stream-driver-setup" aria-label="Optional streaming audio">
			<strong>Streaming audio · Optional</strong>
			<p>
				Record your screen, microphone and computer audio, edit videos and use the
				soundboard without any extra driver. Only sending the microphone + soundboard mix
				into another app needs a virtual audio device.
			</p>
			{status?.platform === "darwin" ? (
				<>
					{status.installed ? (
						<p role="status">
							BlackHole 2ch {status.version} is installed. Refresh audio devices
							below, then choose it as the virtual output and as the microphone in
							OBS, Zoom or Discord.
						</p>
					) : (
						<>
							<p>
								BlackHole is a free virtual audio cable for Mac. Install it here
								when you need Stream mode, or use a virtual device you already have.
							</p>
							<button disabled={busy || active} onClick={() => void install()}>
								{busy
									? "Preparing verified installer…"
									: status.phase === "installer-open"
										? "Reopen BlackHole installer…"
										: "Install BlackHole…"}
							</button>
							<p className="setting-hint">
								Downloads from Existential Audio and opens macOS Installer.
								Administrator approval and a restart may be required. Your default
								microphone and speakers stay unchanged.
							</p>
						</>
					)}
					{status.phase === "installer-open" && !status.installed && (
						<p role="status">
							Finish the steps in macOS Installer, then check again. If you cancelled,
							you can keep recording normally.
						</p>
					)}
					<button disabled={busy} onClick={() => void check()}>
						Check installation
					</button>
					{active && <p>Stop Stream mode before installing a driver.</p>}
				</>
			) : status ? (
				<p>
					{status.platform === "win32" ? (
						<>
							For streaming on Windows, install{" "}
							<a href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer">
								VB-CABLE from its official site
							</a>
							, or use an existing virtual audio device.
						</>
					) : (
						"Use a virtual audio output supported by your system for Stream mode."
					)}
				</p>
			) : (
				<p>Checking optional audio driver…</p>
			)}
			{error && <p role="alert">{error}</p>}
		</section>
	);
}
