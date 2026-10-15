import { z } from "zod";
import type { VoiceCue } from "../../src/lib/voiceCues";
import { validateSettings } from "../ipc/voice/settings";
export function validateVoiceCues(input: unknown): VoiceCue[] {
	const parsed = z
		.array(
			z.object({
				id: z.string().uuid(),
				startMs: z.number().finite().min(0).max(86400000),
				color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
				settings: z.unknown().nullable(),
			}),
		)
		.max(200)
		.parse(input);
	const result = parsed
		.map((c) => ({
			...c,
			settings:
				c.settings == null ? null : { ...validateSettings(c.settings), teamFolder: "" },
		}))
		.sort((a, b) => a.startMs - b.startMs);
	if (
		new Set(result.map((c) => c.startMs)).size !== result.length ||
		(result.length && result[0].startMs !== 0)
	)
		throw Error("Voice regions must start at zero and have unique start times.");
	return result;
}
