import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import type { SecretStorage } from "../ipc/voice/settings";
export const UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
export const CAPTION_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
export type YouTubeConfig = { clientId: string; clientSecret: string; approved: boolean };
export const youtubeConfig = (): YouTubeConfig => ({
	clientId: process.env.MISTARECORDA_YOUTUBE_CLIENT_ID ?? "",
	clientSecret: process.env.MISTARECORDA_YOUTUBE_CLIENT_SECRET ?? "",
	approved: process.env.MISTARECORDA_YOUTUBE_APPROVED === "true",
});
type Tokens = { access_token: string; refresh_token: string; expires_at: number; scope: string };
export class YouTubeAuth {
	private tokens?: Tokens;
	private refreshing?: Promise<string>;
	constructor(
		private dir: string,
		private secure: SecretStorage,
		private config: YouTubeConfig,
		private open: (url: string) => Promise<unknown>,
		private request: typeof fetch = fetch,
	) {}
	private file() {
		return path.join(this.dir, "youtube-token.enc");
	}
	async connected() {
		return (
			!!this.tokens ||
			(await fs
				.stat(this.file())
				.then(() => true)
				.catch(() => false))
		);
	}
	async captionPermission(load = false) {
		if (load) await this.read();
		if (this.tokens) return this.tokens.scope.split(" ").includes(CAPTION_SCOPE);
		return fs
			.readFile(path.join(this.dir, "grant.json"), "utf8")
			.then((t) => JSON.parse(t).captions === true)
			.catch(() => false);
	}
	private requireSecure() {
		if (
			!this.secure.isEncryptionAvailable() ||
			this.secure.getSelectedStorageBackend?.() === "basic_text"
		)
			throw Error(
				"Secure credential storage is unavailable. Unlock your login Keychain and try again.",
			);
	}
	private async read() {
		if (this.tokens) return this.tokens;
		const bytes = await fs.readFile(this.file()).catch(() => undefined);
		if (!bytes) return undefined;
		this.requireSecure();
		const t = JSON.parse(this.secure.decryptString(bytes));
		if (
			typeof t.refresh_token !== "string" ||
			typeof t.access_token !== "string" ||
			typeof t.scope !== "string" ||
			typeof t.expires_at !== "number"
		)
			throw Error("Connect YouTube again.");
		this.tokens = t as Tokens;
		return this.tokens;
	}
	private async save(tokens: Tokens) {
		this.requireSecure();
		await fs.mkdir(this.dir, { recursive: true });
		const temp = this.file() + ".tmp";
		try {
			await fs.writeFile(temp, this.secure.encryptString(JSON.stringify(tokens)), {
				mode: 0o600,
			});
			await fs.rename(temp, this.file());
			this.tokens = tokens;
			await fs.writeFile(
				path.join(this.dir, "grant.json"),
				JSON.stringify({ captions: tokens.scope.split(" ").includes(CAPTION_SCOPE) }),
				{ mode: 0o600 },
			);
		} finally {
			await fs.rm(temp, { force: true });
		}
	}
	private async exchange(params: URLSearchParams, signal?: AbortSignal) {
		params.set("client_id", this.config.clientId);
		if (this.config.clientSecret) params.set("client_secret", this.config.clientSecret);
		const response = await this.request("https://oauth2.googleapis.com/token", {
			method: "POST",
			body: params,
			signal: signal
				? AbortSignal.any([signal, AbortSignal.timeout(30000)])
				: AbortSignal.timeout(30000),
			redirect: "error",
		});
		if (!response.ok)
			throw Error(
				response.status === 400 || response.status === 401
					? "Google authorization expired or was rejected. Connect YouTube again."
					: "Google connection failed. Try again when online.",
			);
		const result = await response.json();
		if (typeof result.access_token !== "string" || !Number.isFinite(result.expires_in))
			throw Error("Google returned an incomplete authorization.");
		return result as {
			access_token: string;
			refresh_token?: string;
			expires_in: number;
			scope?: string;
		};
	}
	async connect(captions: boolean, signal: AbortSignal) {
		if (!this.config.clientId)
			throw Error("YouTube upload is waiting for YouTube approval and configuration.");
		this.requireSecure();
		signal.throwIfAborted();
		const verifier = randomBytes(48).toString("base64url"),
			state = randomBytes(32).toString("base64url");
		const challenge = createHash("sha256").update(verifier).digest("base64url");
		let redirect = "";
		let resolveCode!: (code: string) => void, rejectCode!: (e: Error) => void;
		const codeReady = new Promise<string>((resolve, reject) => {
			resolveCode = resolve;
			rejectCode = reject;
		});
		// Install an observer before opening the browser so cancellation cannot be unhandled.
		void codeReady.catch(() => undefined);
		const server = createServer((req, res) => {
			res.setHeader("Cache-Control", "no-store");
			res.setHeader("Content-Type", "text/plain; charset=utf-8");
			res.setHeader("Content-Security-Policy", "default-src 'none'");
			let url: URL;
			try {
				url = new URL(req.url ?? "/", redirect || "http://127.0.0.1");
			} catch {
				res.writeHead(400).end("Invalid authorization response. Return to MistaRecorda.");
				return;
			}
			const got = Buffer.from(url.searchParams.get("state") ?? ""),
				expected = Buffer.from(state);
			if (
				req.method !== "GET" ||
				req.headers.host !== new URL(redirect).host ||
				url.pathname !== "/oauth2callback" ||
				got.length !== expected.length ||
				!timingSafeEqual(got, expected)
			) {
				res.writeHead(400).end("Invalid authorization response. Return to MistaRecorda.");
				return;
			}
			const code = url.searchParams.get("code");
			if (url.searchParams.has("error") || !code) {
				res.end("YouTube connection cancelled. Return to MistaRecorda.");
				rejectCode(Error("YouTube connection was declined."));
				return;
			}
			res.end("Authorization received. Return to MistaRecorda to finish connecting.");
			resolveCode(code);
		});
		const abort = () => rejectCode(Error("YouTube connection cancelled."));
		signal.addEventListener("abort", abort, { once: true });
		const timeout = setTimeout(
			() => rejectCode(Error("YouTube connection timed out. Try again.")),
			300000,
		);
		timeout.unref();
		try {
			await new Promise<void>((resolve, reject) => {
				server.once("error", reject);
				server.listen(0, "127.0.0.1", resolve);
			});
			const address = server.address();
			if (!address || typeof address === "string")
				throw Error("Could not open Google authorization callback.");
			redirect = `http://127.0.0.1:${address.port}/oauth2callback`;
			signal.throwIfAborted();
			const scope = [UPLOAD_SCOPE, ...(captions ? [CAPTION_SCOPE] : [])].join(" ");
			const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
			auth.search = new URLSearchParams({
				client_id: this.config.clientId,
				redirect_uri: redirect,
				response_type: "code",
				scope,
				state,
				code_challenge: challenge,
				code_challenge_method: "S256",
				access_type: "offline",
				prompt: "consent",
			}).toString();
			await this.open(auth.href);
			const code = await codeReady;
			const result = await this.exchange(
				new URLSearchParams({
					grant_type: "authorization_code",
					code,
					redirect_uri: redirect,
					code_verifier: verifier,
				}),
				signal,
			);
			if (!result.refresh_token)
				throw Error(
					"Google did not grant offline access. Disconnect this app in your Google account, then connect again.",
				);
			await this.save({
				access_token: result.access_token,
				refresh_token: result.refresh_token,
				scope: result.scope ?? scope,
				expires_at: Date.now() + result.expires_in * 1000,
			});
		} finally {
			clearTimeout(timeout);
			signal.removeEventListener("abort", abort);
			server.closeAllConnections();
			server.close();
		}
	}
	async accessToken(force = false): Promise<string> {
		if (this.refreshing) return this.refreshing;
		this.refreshing = (async () => {
			const tokens = await this.read();
			if (!tokens) throw Error("Connect YouTube before uploading.");
			if (!force && tokens.expires_at > Date.now() + 60000) return tokens.access_token;
			const result = await this.exchange(
				new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: tokens.refresh_token,
				}),
			);
			await this.save({
				...tokens,
				access_token: result.access_token,
				expires_at: Date.now() + result.expires_in * 1000,
			});
			return result.access_token;
		})();
		try {
			return await this.refreshing;
		} finally {
			this.refreshing = undefined;
		}
	}
	async disconnect() {
		const tokens = await this.read().catch(() => undefined);
		this.tokens = undefined;
		await fs.rm(this.file(), { force: true });
		await fs.rm(path.join(this.dir, "grant.json"), { force: true });
		if (tokens)
			await this.request("https://oauth2.googleapis.com/revoke", {
				method: "POST",
				body: new URLSearchParams({ token: tokens.refresh_token }),
				signal: AbortSignal.timeout(10000),
				redirect: "error",
			}).catch(() => undefined);
	}
}
