// Public rates checked 2026-10-14. API USD pricing and Creative credits are
// separate billing systems; credit equivalents are not an API invoice.
export const VOICE_RATE_DATE = "October 14, 2026";
export const VOICE_API_USD_PER_MINUTE = 0.12;
export const VOICE_CREDITS_PER_MINUTE = 1000;
export const VOICE_ESTIMATE_BUFFER = 1.05;
const ratedModels = new Set(["eleven_multilingual_sts_v2", "eleven_english_sts_v2"]);
const ceilCent = (value: number) => Math.ceil(value * 100 - 1e-9) / 100;
export function estimateVoiceCost(seconds: number, modelId: string) {
	if (!Number.isFinite(seconds) || seconds <= 0 || !ratedModels.has(modelId)) return null;
	const minutes = seconds / 60;
	const credits =
		Math.ceil((minutes * VOICE_CREDITS_PER_MINUTE * VOICE_ESTIMATE_BUFFER) / 10 - 1e-9) * 10;
	return {
		seconds,
		credits,
		usd: ceilCent(minutes * VOICE_API_USD_PER_MINUTE * VOICE_ESTIMATE_BUFFER),
		// Monthly Creative plans: Business $990/6M through Starter $6/30K.
		// This is an allocated subscription value, not an extra API charge.
		creditPlanUsdLow: ceilCent(credits * (990 / 6000000)),
		creditPlanUsdHigh: ceilCent(credits * (6 / 30000)),
	};
}
export function voiceDurationLabel(seconds: number) {
	const rounded = Math.ceil(seconds);
	return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
