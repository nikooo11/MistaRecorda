import type { VoiceInfo } from "../../../src/types/voice";
export class ElevenLabs {
	constructor(
		private key: string,
		private fetcher: typeof fetch = fetch,
	) {}
	async request(endpoint: string, init: RequestInit = {}) {
		const response = await this.fetcher(`https://api.elevenlabs.io/v1${endpoint}`, {
			...init,
			headers: { ...init.headers, "xi-api-key": this.key },
			redirect: "error",
		});
		if (!response.ok)
			throw new Error(
				(
					{
						401: "invalidKey",
						402: "outOfCredits",
						403: "noAccess",
						422: "invalidAudio",
						429: "rateLimited",
					} as Record<number, string>
				)[response.status] ?? "serviceUnavailable",
			);
		return response;
	}
	async testKey() {
		await this.request("/user");
		return true;
	}
	async voices(): Promise<VoiceInfo[]> {
		const data = await (await this.request("/voices")).json();
		return (data.voices ?? []).map((v: Record<string, unknown>) => ({
			voiceId: String(v.voice_id),
			name: String(v.name),
			category: String(v.category),
			previewUrl: typeof v.preview_url === "string" ? v.preview_url : null,
			source: "workspace-shared",
			publicOwnerId: null,
			canEdit: false,
		}));
	}
}
