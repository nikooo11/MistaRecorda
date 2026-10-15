import { expect, test } from "vitest";
import { estimateVoiceCost, voiceDurationLabel } from "./voiceCost";
test("rates use full audio seconds with conservative rounding", () => {
	expect(estimateVoiceCost(60, "eleven_multilingual_sts_v2")).toMatchObject({
		credits: 1050,
		usd: 0.13,
		creditPlanUsdLow: 0.18,
		creditPlanUsdHigh: 0.21,
	});
	expect(estimateVoiceCost(300, "eleven_english_sts_v2")).toMatchObject({
		credits: 5250,
		usd: 0.63,
	});
	expect(estimateVoiceCost(16.8, "eleven_multilingual_sts_v2")).toMatchObject({
		credits: 300,
		usd: 0.04,
	});
	expect(voiceDurationLabel(59.1)).toBe("1:00");
});
test("unknown future or text-to-speech model has no invented rate", () => {
	for (const model of ["eleven_v4", "future_sts"])
		expect(estimateVoiceCost(60, model)).toBeNull();
	for (const duration of [0, -1, Infinity, NaN])
		expect(estimateVoiceCost(duration, "eleven_multilingual_sts_v2")).toBeNull();
});
