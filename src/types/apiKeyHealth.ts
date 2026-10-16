export type ApiProvider = "OpenAI" | "ElevenLabs";
export interface ApiKeyCheck {
	provider: ApiProvider;
	status: "missing" | "valid" | "invalid" | "restricted" | "unavailable";
	message: string;
	checkedAt: number;
}
