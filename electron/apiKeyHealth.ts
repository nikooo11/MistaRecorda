import type { ApiKeyCheck, ApiProvider } from "../src/types/apiKeyHealth";

interface ProviderCheck {
	provider: ApiProvider;
	key(): Promise<string | undefined>;
	verify(key: string): Promise<number>;
}
/** Health checks never alter saved credentials or return provider response bodies. */
export class ApiKeyHealth {
	state: ApiKeyCheck[] = [];
	private generation = 0;
	constructor(
		private providers: ProviderCheck[],
		private changed: (state: ApiKeyCheck[]) => void,
	) {}
	async check() {
		const generation = ++this.generation;
		const state = await Promise.all(
			this.providers.map(async (provider): Promise<ApiKeyCheck> => {
				let status: ApiKeyCheck["status"] = "unavailable";
				try {
					const key = await provider.key();
					if (!key) status = "missing";
					else {
						const code = await provider.verify(key);
						status =
							code >= 200 && code < 300
								? "valid"
								: code === 401
									? "invalid"
									: code === 403
										? "restricted"
										: "unavailable";
					}
				} catch {
					// Network and Keychain failures do not mean the saved key is invalid.
				}
				const message =
					status === "invalid"
						? `${provider.provider} API key needs updating. It was rejected, expired or revoked. Replace it in Settings → Setup.`
						: status === "restricted"
							? `${provider.provider} API key permissions need updating. Check access in your provider account or replace the key in Settings → Setup.`
							: status === "unavailable"
								? `Could not verify the ${provider.provider} API key. Check your connection, provider availability or Mac Keychain, then retry in Settings → Setup. Your key is still saved.`
								: "";
				return { provider: provider.provider, status, message, checkedAt: Date.now() };
			}),
		);
		if (generation === this.generation) {
			this.state = state;
			this.changed(state);
		}
		return state;
	}
}

export async function verifyProviderKey(provider: ApiProvider, key: string): Promise<number> {
	const response = await fetch(
		provider === "OpenAI"
			? "https://api.openai.com/v1/models/gpt-6-astra"
			: "https://api.elevenlabs.io/v1/user",
		{
			headers:
				provider === "OpenAI" ? { Authorization: `Bearer ${key}` } : { "xi-api-key": key },
			signal: AbortSignal.timeout(5000),
			redirect: "error",
		},
	);
	await response.body?.cancel();
	return response.status;
}
