import { useEffect, useState } from "react";
import type { AudioDevice, StreamRouting, StreamStatus } from "../../types/streamAudio";
export function StreamSettings({
	request,
}: {
	request: <T = unknown>(method: string, input?: unknown) => Promise<T>;
}) {
	const [status, setStatus] = useState<StreamStatus>();
	const [devices, setDevices] = useState<AudioDevice[]>([]);
	const [input, setInput] = useState("");
	const [output, setOutput] = useState("");
	const [monitor, setMonitor] = useState("");
	const [confirmed, setConfirmed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		void request<StreamStatus>("streamInfo")
			.then((s) => {
				setStatus(s);
				if (s.routing) {
					setInput(s.routing.input);
					setOutput(s.routing.output);
					setMonitor(s.routing.monitor);
				}
			})
			.catch((e) => setError(String(e)));
	}, [request]);
	useEffect(() => {
		let mounted = true;
		const timer = setInterval(() => {
			void request<StreamStatus>("streamInfo")
				.then((next) => {
					if (mounted) setStatus(next);
				})
				.catch(() => {
					/* Keep the last state during a transient panel disconnect. */
				});
		}, 1500);
		return () => {
			mounted = false;
			clearInterval(timer);
		};
	}, [request]);
	const run = async (method: string, data?: unknown) => {
		setBusy(true);
		setError("");
		try {
			setStatus(await request<StreamStatus>(method, data));
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	};
	return (
		<section className="stream-settings">
			<h3>Stream mode</h3>
			<p>
				Send your microphone and soundboard to OBS, Zoom, Discord, or another app through a
				virtual audio device.
			</p>
			{status?.active ? (
				<>
					<p role="status">● Live → {status.outputLabel}</p>
					<button disabled={busy} onClick={() => void run("streamStop")}>
						Stop Stream mode
					</button>
				</>
			) : (
				<>
					<button
						disabled={busy}
						onClick={async () => {
							setBusy(true);
							try {
								setDevices(await request<AudioDevice[]>("streamDevices"));
								setError("");
							} catch (e) {
								setError(String(e));
							} finally {
								setBusy(false);
							}
						}}
					>
						Refresh audio devices
					</button>
					{devices.length > 0 && (
						<>
							<label>
								Microphone / live voice changer
								<select value={input} onChange={(e) => setInput(e.target.value)}>
									<option value="">Choose input</option>
									{devices
										.filter((d) => d.kind === "audioinput")
										.map((d) => (
											<option key={d.id} value={d.id}>
												{d.label}
											</option>
										))}
								</select>
							</label>
							<label>
								Virtual output
								<select
									value={output}
									onChange={(e) => {
										setOutput(e.target.value);
										setConfirmed(false);
									}}
								>
									<option value="">Choose virtual device</option>
									{devices
										.filter(
											(d) =>
												d.kind === "audiooutput" &&
												!["default", "communications"].includes(d.id),
										)
										.map((d) => (
											<option key={d.id} value={d.id}>
												{d.label}
											</option>
										))}
								</select>
							</label>
							<label>
								Sound preview / headphones
								<select
									value={monitor}
									onChange={(e) => setMonitor(e.target.value)}
								>
									<option value="">System output</option>
									{devices
										.filter((d) => d.kind === "audiooutput" && d.id !== output)
										.map((d) => (
											<option key={d.id} value={d.id}>
												{d.label}
											</option>
										))}
								</select>
							</label>
							<label>
								<input
									type="checkbox"
									checked={confirmed}
									onChange={(e) => setConfirmed(e.target.checked)}
								/>
								The output is a virtual routing device, not speakers or headphones.
							</label>
							<button
								disabled={busy || !input || !output || !confirmed}
								onClick={() =>
									void run("streamStart", {
										input,
										output,
										monitor,
										virtualOutputConfirmed: true,
										inputLabel:
											devices.find((d) => d.id === input)?.label ||
											"Microphone",
										outputLabel:
											devices.find((d) => d.id === output)?.label ||
											"Virtual output",
									} satisfies StreamRouting)
								}
							>
								Start Stream mode
							</button>
						</>
					)}
				</>
			)}
			<p className="sound-caution">
				Use headphones to prevent speaker sound entering your microphone.
			</p>
			<details>
				<summary>Set up routing and live voices</summary>
				<ol>
					<li>
						Install a virtual audio device such as{" "}
						<a
							href="https://existential.audio/blackhole/"
							target="_blank"
							rel="noreferrer"
						>
							BlackHole
						</a>{" "}
						on Mac or{" "}
						<a href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer">
							VB-CABLE
						</a>{" "}
						on Windows.
					</li>
					<li>
						For live voice conversion, run{" "}
						<a
							href="https://www.voicemod.net/en/voice-changer-for-mac/"
							target="_blank"
							rel="noreferrer"
						>
							Voicemod
						</a>{" "}
						and select its virtual microphone above. Otherwise select your normal
						microphone.
					</li>
					<li>
						Choose a different virtual device as the output here, then select that
						device as the microphone in your streaming/call app. Turn off that app’s
						duplicate microphone input.
					</li>
				</ol>
				<p>
					Voicemod offers a free version; paid voices and prices are shown in its app.
					Change live voices in Voicemod. Its public Control API does not support Mac.
					ElevenLabs choices here apply to recorded narration only; its streaming voice
					endpoint still requires an audio file. No live ElevenLabs upload runs.
				</p>
			</details>
			<output role="status">{error}</output>
		</section>
	);
}
