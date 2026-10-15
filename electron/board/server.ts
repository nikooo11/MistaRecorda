import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import type { BoardDevice } from "../../src/types/board";

const equal = (a: string, b: string) =>
	Buffer.byteLength(a) === Buffer.byteLength(b) &&
	timingSafeEqual(Buffer.from(a), Buffer.from(b));
export class CompanionServer {
	server?: Server;
	port = 0;
	code = "";
	expires = 0;
	devices = new Map<string, BoardDevice & { socket?: WebSocket; token: string }>();
	private sockets = new WebSocketServer({ noServer: true, maxPayload: 50 * 1024 * 1024 });
	constructor(
		readonly root: string,
		readonly action: (method: string, input: unknown, actor: string) => Promise<unknown>,
		readonly changed: () => void,
	) {}
	async start() {
		if (this.server) return this.pairing();
		this.code = randomBytes(24).toString("base64url");
		this.expires = Date.now() + 5 * 60_000;
		this.server = createServer(async (req, res) => {
			try {
				if (!["GET", "HEAD"].includes(req.method ?? "")) {
					res.writeHead(405).end();
					return;
				}
				const url = new URL(req.url ?? "/", "http://localhost");
				const relative =
					url.pathname === "/"
						? "tablet.html"
						: decodeURIComponent(url.pathname).replace(/^\/+/, "");
				if (
					!(
						relative === "tablet.html" ||
						relative.startsWith("assets/") ||
						relative.startsWith("excalidraw/")
					) ||
					relative.split("/").includes("..")
				) {
					res.writeHead(404).end();
					return;
				}
				const file = path.resolve(this.root, relative);
				if (!file.startsWith(path.resolve(this.root) + path.sep)) {
					res.writeHead(403).end();
					return;
				}
				const data = await fs.readFile(file);
				const mime: Record<string, string> = {
					".html": "text/html",
					".js": "text/javascript",
					".css": "text/css",
					".woff2": "font/woff2",
					".png": "image/png",
					".svg": "image/svg+xml",
				};
				res.writeHead(200, {
					"Content-Type": mime[path.extname(file)] ?? "application/octet-stream",
					"Cache-Control": "no-store",
					"X-Content-Type-Options": "nosniff",
					"Referrer-Policy": "no-referrer",
				});
				res.end(req.method === "HEAD" ? undefined : data);
			} catch {
				res.writeHead(404).end();
			}
		});
		this.server.on("upgrade", (req, socket, head) => {
			const origin = req.headers.origin;
			let sameOrigin = false;
			try {
				sameOrigin = !!origin && new URL(origin).host === req.headers.host;
			} catch {
				/* A malformed Origin is rejected below. */
			}
			if (req.url !== "/connect" || !sameOrigin) {
				socket.destroy();
				return;
			}
			if (this.sockets.clients.size >= 8) {
				socket.destroy();
				return;
			}
			this.sockets.handleUpgrade(req, socket, head, (ws) => this.connect(ws));
		});
		await new Promise<void>((resolve, reject) => {
			this.server!.once("error", reject);
			this.server!.listen(0, "0.0.0.0", () => resolve());
		});
		this.port = (this.server.address() as { port: number }).port;
		return this.pairing();
	}
	pairing() {
		return this.server
			? {
					urls: Object.values(networkInterfaces())
						.flat()
						.filter((n) => n?.family === "IPv4" && !n.internal)
						.map((n) => `http://${n!.address}:${this.port}/#${this.code}`),
					code: this.code,
					expires: this.expires,
				}
			: undefined;
	}
	list() {
		return [...this.devices.values()].map(({ id, name, approved, socket }) => ({
			id,
			name,
			approved,
			connected: socket?.readyState === WebSocket.OPEN,
		}));
	}
	private connect(socket: WebSocket) {
		// Malformed frames and abrupt disconnects must not crash the desktop process.
		socket.on("error", () => socket.close());
		let device: ReturnType<typeof this.devices.get>;
		let queue = Promise.resolve();
		let queued = 0;
		let tries = 0;
		const deadline = setTimeout(() => {
			if (!device) socket.close();
		}, 15000);
		socket.on("message", (bytes) => {
			if (++queued > 64) {
				socket.close(1008, "Too many pending operations");
				return;
			}
			queue = queue.then(async () => {
				if (socket.readyState !== WebSocket.OPEN) {
					queued--;
					return;
				}
				let requestId: unknown;
				try {
					const message = JSON.parse(bytes.toString());
					requestId = message.id;
					if (message.type === "pair") {
						if (device) throw Error("This connection is already paired");
						if (++tries > 3) throw Error("Pairing limit reached");
						const existing = [...this.devices.values()].find(
							(d) =>
								typeof message.token === "string" && equal(d.token, message.token),
						);
						if (existing) {
							device = existing;
							existing.socket?.close();
							existing.socket = socket;
							this.changed();
						} else {
							if (
								typeof message.code !== "string" ||
								!equal(message.code, this.code) ||
								Date.now() > this.expires
							)
								throw Error(
									"Pairing code expired. Generate a new QR code on your computer.",
								);
							if (this.devices.size >= 8)
								throw Error("Disconnect an old device first");
							device = {
								id: randomUUID(),
								name: String(message.name ?? "iPad").slice(0, 60),
								token: randomBytes(32).toString("base64url"),
								approved: false,
								connected: true,
								socket,
							};
							this.devices.set(device.id, device);
							this.changed();
						}
						clearTimeout(deadline);
						socket.send(
							JSON.stringify({
								type: device.approved ? "approved" : "pending",
								deviceId: device.id,
								token: device.token,
							}),
						);
						if (device.approved)
							socket.send(
								JSON.stringify({
									type: "info",
									data: await this.action("tabletInfo", undefined, device.id),
								}),
							);
					} else {
						if (
							!device?.approved ||
							this.devices.get(device.id) !== device ||
							device.socket !== socket
						)
							throw Error("Approve this iPad on the computer first");
						if (
							![
								"tabletInfo",
								"presenterInfo",
								"saveTalkingNotes",
								"savePresenterLink",
								"removePresenterLink",
								"saveObjectPreference",
								"openPresenterLink",
								"importPresenterImage",
								"updatePresenterSound",
								"saveCanvasNote",
								"setObjectShadow",
								"setMemeShadow",
								"exportPresentation",
								"importPresentation",
								"savePresentation",
								"loadPresentation",
								"listPresentations",

								"aiInfo",
								"aiSearch",
								"aiGenerate",
								"aiListen",
								"aiStopListening",
								"aiCancel",
								"aiCleanup",
								"aiOpen",
								"aiImport",
								"aiImportGenerated",
								"annotate",
								"captureStill",
								"laser",
								"soundboard",
								"recordingVoices",
								"selectRecordingVoice",
								"streamInfo",
								"streamStop",
								"saveMeme",
								"deleteMeme",
								"placeMeme",
								"removeMeme",
								"playSound",
								"previewSound",
								"scene",
								"mode",
								"viewport",
								"library",
								"saveScene",
								"loadScene",
								"listScenes",
								"signal",
								"clear",
							].includes(message.method)
						)
							throw Error("Unsupported companion operation");
						const data = await this.action(message.method, message.input, device.id);
						socket.send(JSON.stringify({ type: "reply", id: message.id, data }));
					}
				} catch (error) {
					socket.send(
						JSON.stringify({
							type: "error",
							id: requestId,
							message: error instanceof Error ? error.message : "Operation failed",
						}),
					);
				} finally {
					queued--;
				}
			});
		});
		socket.on("close", () => {
			clearTimeout(deadline);
			if (device?.socket === socket) {
				device.socket = undefined;
				this.changed();
			}
		});
	}
	async approve(id: string) {
		const d = this.devices.get(id);
		if (!d) throw Error("Device not found");
		d.approved = true;
		d.socket?.send(JSON.stringify({ type: "approved", deviceId: id, token: d.token }));
		d.socket?.send(
			JSON.stringify({ type: "info", data: await this.action("tabletInfo", undefined, id) }),
		);
		this.changed();
	}
	disconnect(id: string) {
		const d = this.devices.get(id);
		this.devices.delete(id);
		d?.socket?.close();
		this.changed();
	}
	send(id: string, type: string, data: unknown) {
		const d = this.devices.get(id);
		// Drop stale preview frames instead of building a queue on slow Wi-Fi.
		if (
			type === "signal" &&
			(data as { type?: string })?.type === "frame" &&
			(d?.socket?.bufferedAmount ?? 0) > 256 * 1024
		)
			return;
		if (d?.approved && d.socket?.readyState === WebSocket.OPEN)
			d.socket.send(JSON.stringify({ type, data }));
	}
	broadcast(type: string, data: unknown) {
		for (const d of this.devices.values()) this.send(d.id, type, data);
	}
	renew() {
		this.code = randomBytes(24).toString("base64url");
		this.expires = Date.now() + 5 * 60_000;
		return this.pairing();
	}
	stop() {
		for (const socket of this.sockets.clients) socket.close();
		this.code = "";
		this.expires = 0;
		this.devices.clear();
		this.server?.close();
		this.server = undefined;
		this.changed();
	}
}
