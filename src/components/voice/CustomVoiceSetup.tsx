import { useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { unwrapVoice } from "@/types/voice";

export function CustomVoiceSetup({
	onReady,
	onBusy,
}: {
	onReady: () => void;
	onBusy: (busy: boolean) => void;
}) {
	const t = useScopedT("settings");
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [consent, setConsent] = useState(false);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [created, setCreated] = useState<{
		voiceId: string;
		requiresVerification: boolean;
	} | null>(null);
	const openStudio = async () => {
		try {
			const result = await window.electronAPI.openExternalUrl(
				"https://elevenlabs.io/app/voice-lab",
			);
			if (!result.success)
				setMessage("Could not open ElevenLabs. Visit elevenlabs.io → Voices.");
		} catch {
			setMessage("Could not open ElevenLabs. Visit elevenlabs.io → Voices.");
		}
	};
	const create = async () => {
		if (busy) return;
		setBusy(true);
		onBusy(true);
		setMessage("");
		try {
			const result = unwrapVoice(
				await window.electronAPI.voice.request("createVoice", {
					name: name.trim(),
					description,
					consent,
				}),
			);
			if (result) setCreated(result);
		} catch (error) {
			const code = error instanceof Error ? error.message : "operationFailed";
			setMessage(
				`${t(`voice.${code}`, code)} Check My voices before retrying if the request was interrupted.`,
			);
		} finally {
			setBusy(false);
			onBusy(false);
		}
	};
	return (
		<section className="custom-voice-setup">
			<p>
				Use a voice you create, clone, or already have in your ElevenLabs account. Your API
				key must belong to that account and allow voice creation.
			</p>
			{created ? (
				<div className="custom-voice-result" role="status">
					<strong>{name.trim()} created</strong>
					<p>
						{created.requiresVerification
							? "ElevenLabs requires verification before you can use this voice. Complete it in ElevenLabs, then refresh My voices."
							: "Your voice is saved in ElevenLabs. Refresh My voices to preview, favorite, and select it."}
					</p>
					{created.requiresVerification && (
						<button type="button" onClick={() => void openStudio()}>
							Verify in ElevenLabs ↗
						</button>
					)}
					<button type="button" onClick={onReady}>
						Refresh My voices
					</button>
				</div>
			) : (
				<fieldset disabled={busy}>
					<legend>Instant voice clone · in app</legend>
					<p>
						Use clean speech from one speaker, without music. Choose WAV, MP3, M4A, or
						FLAC samples (up to 10 files; 25 MB each, 50 MB total). Your ElevenLabs plan
						must support cloning.
					</p>
					<label>
						Voice name
						<input
							className="voice-input"
							maxLength={160}
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Team narrator"
						/>
					</label>
					<label>
						Description <span>(optional)</span>
						<textarea
							className="voice-input"
							maxLength={2000}
							rows={2}
							value={description}
							onChange={(e) => setDescription(e.target.value)}
						/>
					</label>
					<label className="custom-voice-consent">
						<input
							type="checkbox"
							checked={consent}
							onChange={(e) => setConsent(e.target.checked)}
						/>
						I own this voice or have permission to clone it and upload these samples to
						ElevenLabs.
					</label>
					<button
						type="button"
						disabled={!name.trim() || !consent || busy}
						onClick={() => void create()}
					>
						{busy ? "Creating voice…" : "Choose audio & create voice…"}
					</button>
				</fieldset>
			)}
			<details>
				<summary>Professional clone, Voice Design, or an existing custom voice</summary>
				<ol>
					<li>
						Open ElevenLabs → Voices → Create Voice. Choose Professional Voice Clone for
						your own voice, or Voice Design to create a voice from a description.
					</li>
					<li>
						For a professional clone, upload clean recordings, complete voice
						verification, and wait for training to finish.
					</li>
					<li>
						Return here and refresh My voices. Use the same account’s API key in Voice
						settings.
					</li>
					<li>
						Preview the voice, click Use, then Favorite to make it easy to find. Process
						voice via ElevenLabs only when your recording is ready.
					</li>
				</ol>
				<div className="voice-toolbar">
					<button type="button" disabled={busy} onClick={() => void openStudio()}>
						Open ElevenLabs Voices ↗
					</button>
					<button type="button" disabled={busy} onClick={onReady}>
						Refresh My voices
					</button>
				</div>
			</details>
			<details>
				<summary>Share a team voice or adjust a premade voice</summary>
				<p>
					For any voice, Save preset lets you adjust conversion settings without changing
					the original voice. Edit voice changes the name, description, samples, and
					defaults of a voice you own.
				</p>
				<p>
					Save preset → Export preset, then have teammates use Presets → Import and
					Favorite. A preset contains the voice ID and settings, not the trained voice.
					Each teammate needs ElevenLabs access to that voice through sharing or the same
					workspace.
				</p>
			</details>
			{message && <p role="alert">{message}</p>}
		</section>
	);
}
