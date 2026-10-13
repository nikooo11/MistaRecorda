import { setTimeout as delay } from "node:timers/promises";
import type { VoiceInfo, VoiceSettings } from "../../../src/types/voice";
export class VoiceApiError extends Error {
	constructor(
		public status: number,
		public code: string,
	) {
		super(code);
	}
}
export function errorCode(status: number) {
	return (
		(
			{
				401: "invalidKey",
				402: "outOfCredits",
				403: "noAccess",
				404: "noAccess",
				422: "invalidAudio",
				429: "rateLimited",
			} as Record<number, string>
		)[status] ?? "serviceUnavailable"
	);
}
export function voiceForm(audio: Uint8Array, settings: VoiceSettings) {
	const form = new FormData();
	form.set("audio", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "microphone.wav");
	form.set("model_id", settings.modelId);
	form.set("remove_background_noise", String(settings.removeBackgroundNoise));
	form.set(
		"voice_settings",
		JSON.stringify({
			stability: settings.stability,
			similarity_boost: settings.similarityBoost,
			style: settings.style,
			use_speaker_boost: settings.useSpeakerBoost,
		}),
	);
	return form;
}
export class ElevenLabs {
	constructor(
		private key: string,
		private fetcher: typeof fetch = fetch,
		private sleep: (ms: number, signal?: AbortSignal) => Promise<void> = (ms, signal) =>
			delay(ms, undefined, { signal }),
	) {}
	async request(endpoint: string, init: RequestInit = {}) {
		for (let attempt = 0; ; attempt++) {
			init.signal?.throwIfAborted();
			const response = await this.fetcher(`https://api.elevenlabs.io/v1${endpoint}`, {
				...init,
				headers: { ...init.headers, "xi-api-key": this.key },
				redirect: "error",
			});
			if (response.ok) return response;
			const status = response.status;
			if ((status === 429 || status >= 500) && attempt < 4) {
				await response.body?.cancel();
				await this.sleep(1000 * 2 ** attempt, init.signal ?? undefined);
				continue;
			}
			// Inspect only the structured error type; never surface response bodies or headers.
			let code = errorCode(status);
			if (status === 400 || status === 422) {
				const body = await response.json().catch(() => null);
				if (String(body?.detail?.status ?? "").includes("output_format"))
					code = "unsupportedOutputFormat";
			}
			throw new VoiceApiError(status, code);
		}
	}
	async testKey() {
		await this.request("/user");
		return true;
	}
	async voices(): Promise<VoiceInfo[]> {
		const data = await (await this.request("/voices")).json();
		return (data.voices ?? []).map(mapVoice);
	}
	async speech(
		audio: Uint8Array,
		settings: VoiceSettings,
		signal: AbortSignal,
	): Promise<{ bytes: Uint8Array; format: VoiceSettings["outputFormat"] }> {
		const send = async (format: VoiceSettings["outputFormat"]) =>
			new Uint8Array(
				await (
					await this.request(
						`/speech-to-speech/${encodeURIComponent(settings.voiceId)}?output_format=${format}`,
						{ method: "POST", body: voiceForm(audio, settings), signal },
					)
				).arrayBuffer(),
			);
		try {
			return { bytes: await send(settings.outputFormat), format: settings.outputFormat };
		} catch (e) {
			if (
				settings.outputFormat === "pcm_44100" &&
				e instanceof VoiceApiError &&
				e.code === "unsupportedOutputFormat"
			)
				return { bytes: await send("mp3_44100_192"), format: "mp3_44100_192" };
			throw e;
		}
	}
}
export function mapVoice(v: Record<string, unknown>): VoiceInfo {
	const sharing = v.sharing as Record<string, unknown> | undefined;
	// Only affirmative ownership metadata permits editing; category alone is insufficient.
	const owned = v.is_owner === true || sharing?.is_owner === true;
	return {
		voiceId: String(v.voice_id),
		name: String(v.name),
		category: String(v.category),
		previewUrl:
			typeof v.preview_url === "string" && v.preview_url.startsWith("https://")
				? v.preview_url
				: null,
		source: owned ? "owned" : "workspace-shared",
		publicOwnerId:
			typeof sharing?.public_owner_id === "string" ? sharing.public_owner_id : null,
		canEdit: owned,
		description: typeof v.description === "string" ? v.description : "",
		labels: (v.labels ?? {}) as Record<string, string>,
	};
}
