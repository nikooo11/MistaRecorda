import { afterEach, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { YouTubeAuth, UPLOAD_SCOPE, CAPTION_SCOPE } from "./auth";
const dirs: string[] = [];
const secure = {
	isEncryptionAvailable: () => true,
	encryptString: (s: string) => Buffer.from("test-encrypted:" + s),
	decryptString: (b: Buffer) => b.toString().slice(15),
};
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});
async function dir() {
	const d = await fs.mkdtemp(path.join(os.tmpdir(), "oauth-test-"));
	dirs.push(d);
	return d;
}
it("uses loopback PKCE, rejects bad state, persists refresh access and removes it on disconnect", async () => {
	const d = await dir();
	let challenge = "";
	let redirect = "";
	const request = vi.fn(async (url: unknown, options?: RequestInit) => {
		const body = options?.body as URLSearchParams;
		if (String(url).endsWith("/token")) {
			expect(
				createHash("sha256").update(body.get("code_verifier")!).digest("base64url"),
			).toBe(challenge);
			expect(body.get("redirect_uri")).toBe(redirect);
			return Response.json({
				access_token: "access-test",
				refresh_token: "refresh-test",
				expires_in: 3600,
				scope: UPLOAD_SCOPE,
			});
		}
		return new Response(null, { status: 200 });
	}) as unknown as typeof fetch;
	const auth = new YouTubeAuth(
		d,
		secure,
		{ clientId: "id", clientSecret: "secret", approved: false },
		async (u) => {
			const url = new URL(u);
			expect(url.origin).toBe("https://accounts.google.com");
			expect(url.searchParams.get("scope")).toBe(UPLOAD_SCOPE);
			expect(url.searchParams.get("code_challenge_method")).toBe("S256");
			challenge = url.searchParams.get("code_challenge")!;
			redirect = url.searchParams.get("redirect_uri")!;
			expect(new URL(redirect).hostname).toBe("127.0.0.1");
			expect((await fetch(redirect + "?code=bad&state=bad")).status).toBe(400);
			expect(
				(await fetch(redirect + "?code=test&state=" + url.searchParams.get("state")))
					.status,
			).toBe(200);
		},
		request,
	);
	await auth.connect(false, new AbortController().signal);
	expect(await auth.connected()).toBe(true);
	expect(await auth.accessToken()).toBe("access-test");
	expect((await fs.stat(path.join(d, "youtube-token.enc"))).mode & 0o777).toBe(0o600);
	const reopened = new YouTubeAuth(
		d,
		secure,
		{ clientId: "id", clientSecret: "", approved: false },
		async () => {},
		request,
	);
	expect(await reopened.accessToken()).toBe("access-test");
	expect(await reopened.captionPermission()).toBe(false);
	await reopened.disconnect();
	expect(await reopened.connected()).toBe(false);
	expect(request).toHaveBeenCalledTimes(2);
});
it("requests broad captions scope only with explicit opt-in and cancels callback cleanly", async () => {
	const controller = new AbortController();
	const auth = new YouTubeAuth(
		await dir(),
		secure,
		{ clientId: "id", clientSecret: "", approved: false },
		async (u) => {
			expect(new URL(u).searchParams.get("scope")).toBe(UPLOAD_SCOPE + " " + CAPTION_SCOPE);
			controller.abort();
		},
	);
	await expect(auth.connect(true, controller.signal)).rejects.toThrow("cancelled");
});
it("fails closed when unconfigured or insecure rather than storing plaintext credentials", async () => {
	const open = vi.fn();
	const auth = new YouTubeAuth(
		await dir(),
		{ ...secure, isEncryptionAvailable: () => false },
		{ clientId: "id", clientSecret: "", approved: false },
		open,
	);
	await expect(auth.connect(false, new AbortController().signal)).rejects.toThrow("Secure");
	expect(open).not.toHaveBeenCalled();
});
