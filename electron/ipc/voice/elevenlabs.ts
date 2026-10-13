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
				signal: AbortSignal.any([
					...(init.signal ? [init.signal] : []),
					AbortSignal.timeout(60000),
				]),
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
	async getVoice(id: string): Promise<VoiceInfo> {
		return mapVoice(await (await this.request(`/voices/${encodeURIComponent(id)}`)).json());
	}
	async library(filters: {
		search?: string;
		gender?: string;
		accent?: string;
		useCase?: string;
	}): Promise<VoiceInfo[]> {
		const query = new URLSearchParams({ page_size: "100" });
		for (const [key, value] of Object.entries({
			search: filters.search,
			gender: filters.gender,
			accent: filters.accent,
			use_cases: filters.useCase,
		})) {
			if (value) query.set(key, value.slice(0, 200));
		}
		const data = await (await this.request(`/shared-voices?${query}`)).json();
		return (data.voices ?? []).map((v: Record<string, unknown>) => ({
			...mapVoice(v),
			source: "library" as const,
			publicOwnerId: typeof v.public_owner_id === "string" ? v.public_owner_id : null,
			canEdit: false,
		}));
	}
	async addLibraryVoice(owner: string, id: string, name: string) {
		return (
			await this.request(
				`/voices/add/${encodeURIComponent(owner)}/${encodeURIComponent(id)}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ new_name: name, bookmarked: true }),
				},
			)
		).json();
	}
	async editVoice(
		id: string,
		values: {
			name: string;
			description: string;
			labels: Record<string, string>;
			settings: VoiceSettings;
		},
		samples: Array<{ name: string; bytes: Uint8Array }>,
	) {
		if (!(await this.getVoice(id)).canEdit) throw new Error("voiceNotOwned");
		const form = new FormData();
		form.set("name", values.name);
		form.set("description", values.description);
		form.set("labels", JSON.stringify(values.labels));
		for (const sample of samples)
			form.append("files", new Blob([new Uint8Array(sample.bytes)]), sample.name);
		await this.request(`/voices/${encodeURIComponent(id)}/edit`, {
			method: "POST",
			body: form,
		});
		await this.request(`/voices/${encodeURIComponent(id)}/settings/edit`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				stability: values.settings.stability,
				similarity_boost: values.settings.similarityBoost,
				style: values.settings.style,
				use_speaker_boost: values.settings.useSpeakerBoost,
			}),
		});
		return true;
	}
	async shareVoice(
		id: string,
		role: "viewer" | "editor" | "admin",
		recipient: { user_email?: string; group_id?: string },
	) {
		if (!(await this.getVoice(id)).canEdit) throw new Error("voiceNotOwned");
		await this.request(`/workspace/resources/${encodeURIComponent(id)}/share`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ resource_type: "voice", role, ...recipient }),
		});
		return true;
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
	const defaults = v.settings as Record<string, unknown> | undefined;
	return {
		voiceId: String(v.voice_id),
		name: String(v.name),
		category: String(v.category),
		previewUrl:
			typeof v.preview_url === "string" && v.preview_url.startsWith("https://")
				? v.preview_url
				: null,
		source: owned
			? "owned"
			: typeof sharing?.public_owner_id === "string"
				? "library"
				: "workspace-shared",
		publicOwnerId:
			typeof sharing?.public_owner_id === "string" ? sharing.public_owner_id : null,
		canEdit: owned,
		defaultSettings:
			defaults &&
			[defaults.stability, defaults.similarity_boost, defaults.style].every(
				(x) => typeof x === "number" && x >= 0 && x <= 1,
			)
				? {
						stability: defaults.stability as number,
						similarityBoost: defaults.similarity_boost as number,
						style: defaults.style as number,
						useSpeakerBoost: defaults.use_speaker_boost === true,
					}
				: undefined,
		description: typeof v.description === "string" ? v.description : "",
		labels: (v.labels ?? {}) as Record<string, string>,
	};
}
