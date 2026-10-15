import { setTimeout as delay } from "node:timers/promises";
import type { VoiceInfo, VoiceSettings, VoiceModel } from "../../../src/types/voice";
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
	async request(endpoint: string, init: RequestInit = {}, retry = true) {
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
			if (retry && (status === 429 || status >= 500) && attempt < 4) {
				await response.body?.cancel();
				await this.sleep(1000 * 2 ** attempt, init.signal ?? undefined);
				continue;
			}
			// Inspect provider errors locally; never surface response bodies or headers.
			let code = errorCode(status);
			const body = await response.json().catch(() => null);
			const providerCode = String(body?.detail?.code ?? body?.detail?.status ?? "");
			const requestedFormat = new URL(endpoint, "https://api.elevenlabs.io").searchParams.get(
				"output_format",
			);
			const providerMessage =
				typeof body?.detail?.message === "string" ? body.detail.message.slice(0, 4096) : "";
			// Some API versions label a format-tier restriction subscription_required
			// without a param. Require the exact requested format in the explanation
			// before retrying; unrelated plan/voice denials must remain terminal.
			const formatTierDenied =
				providerCode === "subscription_required" &&
				requestedFormat !== null &&
				/output[ _]format/i.test(providerMessage) &&
				providerMessage.includes(requestedFormat);
			if (
				[400, 403, 422].includes(status) &&
				(providerCode.includes("output_format") ||
					body?.detail?.param === "output_format" ||
					formatTierDenied)
			) {
				code = "unsupportedOutputFormat";
			} else if (["missing_permissions", "insufficient_permissions"].includes(providerCode)) {
				code = "missingApiPermission";
			} else if (["subscription_required", "feature_not_available"].includes(providerCode)) {
				code = "planRequired";
			} else if (providerCode === "model_access_denied") {
				code = "modelAccessDenied";
			}
			throw new VoiceApiError(status, code);
		}
	}
	async testKey() {
		await this.request("/user");
		return true;
	}
	async models(): Promise<VoiceModel[]> {
		const data = await (await this.request("/models")).json();
		if (!Array.isArray(data)) throw new Error("serviceUnavailable");
		return data
			.filter(
				(m) =>
					typeof m.model_id === "string" && /^eleven_[a-z0-9_]{1,80}$/.test(m.model_id),
			)
			.map((m) => ({
				modelId: m.model_id,
				name: typeof m.name === "string" ? m.name : m.model_id,
				canConvert: m.can_do_voice_conversion === true,
				canSpeak: m.can_do_text_to_speech === true,
			}));
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
	async createVoice(
		values: { name: string; description: string },
		samples: Array<{ name: string; bytes: Uint8Array }>,
	) {
		if (!samples.length) throw new Error("invalidSamples");
		const form = new FormData();
		form.set("name", values.name);
		form.set("description", values.description);
		for (const sample of samples)
			form.append("files", new Blob([new Uint8Array(sample.bytes)]), sample.name);
		// Creation is not idempotent: an ambiguous failure must not create duplicates.
		const data = await (
			await this.request("/voices/add", { method: "POST", body: form }, false)
		).json();
		if (typeof data.voice_id !== "string" || !data.voice_id)
			throw new Error("serviceUnavailable");
		return {
			voiceId: data.voice_id,
			requiresVerification: data.requires_verification === true,
		};
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
	): Promise<{ bytes: Uint8Array; format: VoiceSettings["outputFormat"] | "mp3_44100_128" }> {
		const send = async (format: VoiceSettings["outputFormat"] | "mp3_44100_128") =>
			new Uint8Array(
				await (
					await this.request(
						`/speech-to-speech/${encodeURIComponent(settings.voiceId)}?output_format=${format}`,
						{ method: "POST", body: voiceForm(audio, settings), signal },
					)
				).arrayBuffer(),
			);
		// PCM 44.1 kHz and MP3 192 kbps require higher subscription tiers.
		// Retry only an explicit format denial, never an unrelated authorization failure.
		const formats =
			settings.outputFormat === "pcm_44100"
				? (["pcm_44100", "mp3_44100_192", "mp3_44100_128"] as const)
				: (["mp3_44100_192", "mp3_44100_128"] as const);
		for (const [index, format] of formats.entries()) {
			try {
				return { bytes: await send(format), format };
			} catch (e) {
				if (
					!(e instanceof VoiceApiError) ||
					e.code !== "unsupportedOutputFormat" ||
					index === formats.length - 1
				)
					throw e;
			}
		}
		throw new Error("unsupportedOutputFormat");
	}
}
export function mapVoice(v: Record<string, unknown>): VoiceInfo {
	const sharing = v.sharing as Record<string, unknown> | undefined;
	// Only affirmative ownership metadata permits editing; category alone is insufficient.
	const owned = v.is_owner === true || sharing?.is_owner === true;
	const defaults = v.settings as Record<string, unknown> | undefined;
	return {
		voiceId: String(v.voice_id),
		highQualityModelIds: Array.isArray(v.high_quality_base_model_ids)
			? v.high_quality_base_model_ids.filter(
					(id): id is string =>
						typeof id === "string" && /^eleven_[a-z0-9_]{1,80}$/.test(id),
				)
			: [],
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
