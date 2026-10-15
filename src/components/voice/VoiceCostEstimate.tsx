import { useEffect, useState } from "react";
import { unwrapVoice } from "@/types/voice";
import { estimateVoiceCost, voiceDurationLabel, VOICE_RATE_DATE } from "./voiceCost";
import "./voiceCost.css";
export function VoiceCostEstimate({ videoPath, modelId }: { videoPath: string; modelId: string }) {
	const [duration, setDuration] = useState<{ path: string; seconds: number } | null>(null);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		let cancelled = false;
		setFailed(false);
		void window.electronAPI.voice
			.request("audioDuration", videoPath)
			.then((result) => {
				const seconds = unwrapVoice(result);
				if (!cancelled) setDuration({ path: videoPath, seconds });
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, [videoPath]);
	const seconds = duration?.path === videoPath ? duration.seconds : null;
	const estimate = seconds ? estimateVoiceCost(seconds, modelId) : null;
	return (
		<details className="voice-cost">
			<summary>
				{estimate ? (
					<>
						<strong>~${estimate.usd.toFixed(2)} USD</strong> · ~
						{estimate.credits.toLocaleString()} credit equivalent{" "}
						<span>{voiceDurationLabel(estimate.seconds)} mic · estimate</span>
					</>
				) : failed ? (
					"Cost unavailable · view rates"
				) : seconds ? (
					"Model rate unverified · view rates"
				) : (
					"Checking audio length…"
				)}
			</summary>
			<p>
				Voice Changer API: $0.12/minute. Creative plans: 1,000 credits/minute. API billing
				uses USD; credits are shown for comparison.
			</p>
			<table>
				<caption>Conservative estimates per processing run</caption>
				<thead>
					<tr>
						<th>Audio</th>
						<th>Credit equivalent</th>
						<th>API USD</th>
					</tr>
				</thead>
				<tbody>
					{[30, 60, 300, 600].map((s) => {
						const cost = estimateVoiceCost(s, "eleven_multilingual_sts_v2")!;
						return (
							<tr key={s}>
								<td>{voiceDurationLabel(s)}</td>
								<td>~{cost.credits.toLocaleString()}</td>
								<td>~${cost.usd.toFixed(2)}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
			<p>
				{estimate
					? `Those credits represent roughly $${estimate.creditPlanUsdLow.toFixed(2)}–$${estimate.creditPlanUsdHigh.toFixed(2)} of a monthly Creative subscription. `
					: "Monthly Creative credits cost roughly $0.17–$0.20 per 1,000. "}
				This assumes the full paid allowance is used; it is separate from API pricing.
			</p>
			<p>
				Uses the full original microphone track, including silence and trimmed sections.
				Includes a 5% buffer, rounded up to 10 credits and $0.01. Taxes, repeat processing,
				premium voices and account-specific rates can change the charge. Included allowances
				may cover it.
			</p>
			<p>
				Rates checked {VOICE_RATE_DATE}.{" "}
				<a
					href="https://elevenlabs.io/pricing/api"
					onClick={(e) => {
						e.preventDefault();
						void window.electronAPI.openExternalUrl(
							"https://elevenlabs.io/pricing/api",
						);
					}}
				>
					API pricing
				</a>{" "}
				·{" "}
				<a
					href="https://elevenlabs.io/pricing"
					onClick={(e) => {
						e.preventDefault();
						void window.electronAPI.openExternalUrl("https://elevenlabs.io/pricing");
					}}
				>
					Credit plans
				</a>
			</p>
		</details>
	);
}
