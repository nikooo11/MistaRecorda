import { expect, test, vi } from "vitest";
import { ApiKeyHealth, verifyProviderKey } from "./apiKeyHealth";

test("checks each saved provider and distinguishes rejected keys, permissions and outages", async () => {
	const changed = vi.fn();
	const key = vi.fn(async () => "test-secret-never-returned");
	const openai = vi.fn(async () => 401);
	const eleven = vi.fn(async () => 200);
	const health = new ApiKeyHealth(
		[
			{ provider: "OpenAI", key, verify: openai },
			{ provider: "ElevenLabs", key, verify: eleven },
		],
		changed,
	);
	const state = await health.check();
	expect(state.map((check) => check.status)).toEqual(["invalid", "valid"]);
	expect(state[0].message).toContain("OpenAI API key needs updating");
	expect(JSON.stringify(state)).not.toContain("test-secret-never-returned");
	openai.mockResolvedValue(403);
	eleven.mockRejectedValue(Error("private provider error body"));
	expect((await health.check()).map((check) => check.status)).toEqual([
		"restricted",
		"unavailable",
	]);
	expect(health.state[1].message).toContain("Your key is still saved");
	expect(JSON.stringify(health.state)).not.toContain("private provider error body");
	expect(key).toHaveBeenCalledTimes(4);
	expect(changed).toHaveBeenCalledTimes(2);
});

test("missing keys make no API request, and stale startup checks cannot overwrite a newer check", async () => {
	const verify = vi.fn(async () => 200);
	const missing = new ApiKeyHealth(
		[{ provider: "OpenAI", key: async () => undefined, verify }],
		vi.fn(),
	);
	expect((await missing.check())[0].status).toBe("missing");
	expect(verify).not.toHaveBeenCalled();
	let finish!: (code: number) => void;
	const health = new ApiKeyHealth(
		[
			{
				provider: "OpenAI",
				key: async () => "test-key",
				verify: vi
					.fn()
					.mockImplementationOnce(
						() =>
							new Promise<number>((resolve) => {
								finish = resolve;
							}),
					)
					.mockResolvedValueOnce(200),
			},
		],
		vi.fn(),
	);
	const old = health.check();
	await Promise.resolve();
	await health.check();
	finish(401);
	await old;
	expect(health.state[0].status).toBe("valid");
});

test("provider probes are bounded read-only calls and discard response bodies", async () => {
	const cancel = vi.fn();
	const fetcher = vi.fn(async () => ({ status: 200, body: { cancel } }));
	vi.stubGlobal("fetch", fetcher);
	try {
		await verifyProviderKey("OpenAI", "test-openai");
		await verifyProviderKey("ElevenLabs", "test-eleven");
		expect(fetcher.mock.calls[0]).toEqual([
			"https://api.openai.com/v1/models/gpt-6-astra",
			expect.objectContaining({
				headers: { Authorization: "Bearer test-openai" },
				redirect: "error",
				signal: expect.any(AbortSignal),
			}),
		]);
		expect(fetcher.mock.calls[1]).toEqual([
			"https://api.elevenlabs.io/v1/user",
			expect.objectContaining({ headers: { "xi-api-key": "test-eleven" } }),
		]);
		expect(cancel).toHaveBeenCalledTimes(2);
	} finally {
		vi.unstubAllGlobals();
	}
});
