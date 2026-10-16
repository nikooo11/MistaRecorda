import { useEffect, useState } from "react";
import type { FigureState } from "../../types/figures";
import { unwrapVoice } from "../../types/voice";

type Provider = "OpenAI" | "ElevenLabs";
function KeyCard({ provider }: { provider: Provider }) {
	const [saved, setSaved] = useState(false);
	const [key, setKey] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState(false);
	useEffect(() => {
		let disposed = false;
		const read = async () => {
			try {
				const state =
					provider === "OpenAI"
						? await window.electronAPI.board.request<FigureState>("aiInfo")
						: unwrapVoice(
								await window.electronAPI.voice.request("getSettings", undefined),
							);
				if (!disposed) setSaved(state.hasKey);
			} catch {
				if (!disposed) {
					setError(true);
					setMessage("Could not read key status. Reopen Setup to retry.");
				}
			}
		};
		void read();
		const off =
			provider === "ElevenLabs"
				? window.electronAPI.voice.onSettingsChanged(() => void read())
				: undefined;
		return () => {
			disposed = true;
			off?.();
		};
	}, [provider]);
	async function run(action: "save" | "remove" | "test" | "import") {
		setBusy(true);
		setError(false);
		setMessage("");
		try {
			if (action === "import") {
				const state = await window.electronAPI.board.request<FigureState | null>(
					"aiImportKey",
				);
				if (state) {
					setSaved(state.hasKey);
					setKey("");
					setMessage("Key imported securely on this computer.");
				}
			} else if (action === "test") {
				if (provider === "OpenAI") await window.electronAPI.board.request("aiTestKey");
				else unwrapVoice(await window.electronAPI.voice.request("testKey", undefined));
				setMessage("Connection verified.");
			} else {
				const value = action === "remove" ? "" : key.trim();
				const state =
					provider === "OpenAI"
						? await window.electronAPI.board.request<FigureState>("aiSetKey", value)
						: unwrapVoice(await window.electronAPI.voice.request("setKey", value));
				setSaved(state.hasKey);
				setKey("");
				setMessage(
					action === "remove"
						? "Key removed from this computer."
						: "Key saved securely on this computer.",
				);
			}
		} catch (e) {
			setError(true);
			const raw = e instanceof Error ? e.message : String(e);
			setMessage(
				/Choose an env file containing a valid OPENAI_API_KEY/.test(raw)
					? "Choose an env file containing OPENAI_API_KEY (under 64 KB)."
					: /401|unauthorized|invalid.*key|invalidKey/i.test(raw)
						? "Key rejected. It may be expired or revoked. Enter a replacement key."
						: /secureStorageUnavailable|Secure.*storage/i.test(raw)
							? "Secure storage is unavailable. Unlock your computer’s key storage and try again."
							: "Could not complete this action. Check your connection, key permissions and provider billing, then try again.",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<section className="api-key-card" aria-label={`${provider} connection`}>
			<header>
				<h3>{provider}</h3>
				<span>{saved ? "Key saved" : "Not connected"}</span>
			</header>
			<p>
				{provider === "OpenAI"
					? "AI figure search, visual suggestions and image generation."
					: "Custom voices and recorded narration conversion."}
			</p>
			<label>
				{provider} API key
				<input
					aria-label={`${provider} API key`}
					data-help="Paste a key from your own provider account. It is encrypted on this computer, stays saved between launches and is not shared with projects."
					type="password"
					autoComplete="off"
					spellCheck={false}
					maxLength={4096}
					value={key}
					onChange={(e) => setKey(e.target.value)}
					placeholder={saved ? "Enter a replacement key" : "Paste your API key"}
					disabled={busy}
				/>
			</label>
			<div className="api-key-actions">
				{provider === "OpenAI" && (
					<button
						disabled={busy}
						onClick={() => void run("import")}
						data-help="Choose a local .env file containing OPENAI_API_KEY. The key is imported directly into encrypted storage on this Mac; it is never sent to the iPad or included in a project."
					>
						Import env file
					</button>
				)}
				<button
					data-help="Save this key securely on this computer. If a key is already saved, this replaces it."
					disabled={busy || !key.trim()}
					onClick={() => void run("save")}
				>
					{saved ? "Replace key" : "Save key"}
				</button>
				<button
					data-help="Contact the provider to check whether your saved key and account permissions work. This does not generate media."
					disabled={busy || !saved}
					onClick={() => void run("test")}
				>
					Test connection
				</button>
				<button
					data-help="Delete this provider’s saved key from this computer. You can add a new one later. This does not revoke the key in your provider account."
					disabled={busy || !saved}
					onClick={() => void run("remove")}
				>
					Remove key
				</button>
			</div>
			<p
				role="status"
				className={
					error
						? "capture-error"
						: message === "Connection verified."
							? "capture-note api-connection-verified"
							: "capture-note"
				}
			>
				{busy ? "Working…" : message}
			</p>
		</section>
	);
}
export function ApiSetup() {
	return (
		<section className="api-setup" aria-label="API setup">
			<h2>Setup</h2>
			<p>
				Connect your own accounts once. Keys stay encrypted on this computer between
				launches and are never included in projects or shared environments.
			</p>
			<KeyCard provider="OpenAI" />
			<KeyCard provider="ElevenLabs" />
			<p className="capture-note">
				Keep using a saved key until it expires, is revoked, or you remove it. Use Replace
				key to update it. Set up your keys again on a new computer. API usage is billed by
				each provider.
			</p>
		</section>
	);
}
