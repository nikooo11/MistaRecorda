import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { remoteActionSchema, type RemoteAction, type RemoteArmed } from "../../src/types/remote";

/** Private staging is scoped to the paired controller, never broadcast to the canvas. */
export class RemoteStaging {
	private staged = new Map<string, RemoteArmed>();
	get(actor: string) {
		return this.staged.get(actor) ?? null;
	}
	stage(actor: string, item: Omit<RemoteArmed, "token">) {
		if (this.staged.size >= 100 && !this.staged.has(actor))
			throw Error("Too many controllers. Reconnect the companion.");
		const armed = { ...item, token: randomUUID() };
		this.staged.set(actor, armed);
		return armed;
	}
	cancel(actor: string) {
		this.staged.delete(actor);
	}
	take(actor: string, token: string) {
		const armed = this.get(actor);
		if (!armed || armed.token !== token)
			throw Error("This item is no longer staged. Select it again.");
		this.cancel(actor);
		return armed;
	}
}

/** Opt-in Stream Deck bridge. It never listens on the LAN and exposes no arbitrary IPC. */
export class RemoteControlServer {
	server?: Server;
	token = "";
	url = "";
	constructor(
		private info: () => unknown | Promise<unknown>,
		private action: (input: RemoteAction) => Promise<unknown>,
	) {}
	async start() {
		if (this.server) return { url: this.url, token: this.token };
		this.token = randomBytes(32).toString("base64url");
		const server = createServer(async (req, res) => {
			res.setHeader("Cache-Control", "no-store");
			res.setHeader("Content-Type", "application/json");
			res.setHeader("X-Content-Type-Options", "nosniff");
			const respond = (code: number, data: unknown) =>
				res.writeHead(code).end(JSON.stringify(data));
			const supplied = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer /, ""));
			const expected = Buffer.from(this.token);
			if (
				req.socket.remoteAddress !== "127.0.0.1" ||
				req.headers.origin ||
				req.headers.host !== new URL(this.url).host ||
				supplied.length !== expected.length ||
				!timingSafeEqual(supplied, expected)
			) {
				respond(403, { error: "Authorized localhost controller required." });
				return;
			}
			try {
				if (req.method === "GET" && req.url === "/status") {
					respond(200, await this.info());
					return;
				}
				if (req.method !== "POST" || req.url !== "/action") {
					respond(404, { error: "Unknown endpoint." });
					return;
				}
				if (!(req.headers["content-type"] ?? "").startsWith("application/json")) {
					respond(415, { error: "Use application/json." });
					return;
				}
				const chunks: Buffer[] = [];
				let size = 0;
				for await (const chunk of req) {
					size += chunk.length;
					if (size > 8192) {
						respond(413, { error: "Request too large." });
						return;
					}
					chunks.push(Buffer.from(chunk));
				}
				const parsed = remoteActionSchema.safeParse(
					JSON.parse(Buffer.concat(chunks).toString("utf8")),
				);
				if (!parsed.success) {
					respond(400, { error: "Unsupported action or invalid arguments." });
					return;
				}
				respond(200, await this.action(parsed.data));
			} catch (e) {
				respond(400, { error: e instanceof Error ? e.message : "Action failed." });
			}
		});
		server.requestTimeout = 10000;
		server.headersTimeout = 10000;
		try {
			await new Promise<void>((resolve, reject) => {
				server.once("error", reject);
				server.listen(0, "127.0.0.1", resolve);
			});
			const address = server.address();
			if (!address || typeof address === "string")
				throw Error("Could not start remote controller.");
			this.url = `http://127.0.0.1:${address.port}`;
			this.server = server;
			return { url: this.url, token: this.token };
		} catch (e) {
			server.close();
			this.token = "";
			throw e;
		}
	}
	stop() {
		this.server?.closeAllConnections();
		this.server?.close();
		this.server = undefined;
		this.token = "";
		this.url = "";
	}
}
