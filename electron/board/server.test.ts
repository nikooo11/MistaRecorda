import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { afterEach, expect, test, vi } from "vitest";
import { CompanionServer } from "./server";
let server: CompanionServer;
let socket: WebSocket;
let root: string;
afterEach(async () => {
	socket?.terminate();
	server?.stop();
	if (root) await fs.rm(root, { recursive: true, force: true });
});
function message(expectedType?: string) {
	return new Promise<{ type: string; message: string; deviceId: string }>((resolve) => {
		const receive = (bytes: Buffer) => {
			const result = JSON.parse(bytes.toString());
			if (expectedType && result.type !== expectedType) return;
			socket.off("message", receive);
			resolve(result);
		};
		socket.on("message", receive);
	});
}
async function connect() {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "board-http-"));
	await fs.writeFile(path.join(root, "tablet.html"), "Companion");
	const action = vi.fn(async () => ({ state: { revision: 1 } }));
	server = new CompanionServer(root, action, () => {});
	await server.start();
	socket = new WebSocket(`ws://127.0.0.1:${server.port}/connect`, {
		origin: `http://127.0.0.1:${server.port}`,
	});
	await new Promise((r) => socket.once("open", r));
	return action;
}
test("pairing requires explicit approval and cannot invoke presenter/MCP operations", async () => {
	const action = await connect();
	let next = message();
	socket.send(JSON.stringify({ type: "pair", code: server.code, name: "Test tablet" }));
	const paired = await next;
	expect(paired.type).toBe("pending");
	next = message();
	socket.send(JSON.stringify({ id: 1, method: "scene" }));
	expect((await next).message).toContain("Approve");
	expect(action).not.toHaveBeenCalled();
	next = message();
	await server.approve(paired.deviceId);
	expect((await next).type).toBe("approved");
	// Approval also emits an initial scene; wait for the requested rejection, not that broadcast.
	next = message("error");
	socket.send(JSON.stringify({ id: 2, method: "mcp", input: true }));
	expect((await next).message).toContain("Unsupported");
	expect(action).toHaveBeenCalledTimes(1);
});
test("expired QR codes cannot pair and arbitrary files are not served", async () => {
	await connect();
	server.expires = Date.now() - 1;
	const next = message();
	socket.send(JSON.stringify({ type: "pair", code: server.code }));
	expect((await next).message).toContain("expired");
	const response = await fetch(`http://127.0.0.1:${server.port}/package.json`);
	expect(response.status).toBe(404);
	expect(await (await fetch(`http://127.0.0.1:${server.port}/`)).text()).toBe("Companion");
});

test("overlapping drawing and signaling requests are processed in arrival order", async () => {
	const action = await connect();
	const next = message();
	socket.send(JSON.stringify({ type: "pair", code: server.code }));
	const paired = await next;
	const approved = message();
	await server.approve(paired.deviceId);
	await approved;
	action.mockImplementation(async () => {
		await new Promise((r) => setTimeout(r, 10));
		return { state: { revision: 2 } };
	});
	const received: number[] = [];
	const complete = new Promise<void>((resolve, reject) => {
		socket.on("message", (b) => {
			const m = JSON.parse(b.toString());
			if (m.type === "error") reject(Error(m.message));
			if (m.type === "reply") {
				received.push(m.id);
				if (received.length === 3) resolve();
			}
		});
	});
	for (const [id, method] of [
		[1, "scene"],
		[2, "signal"],
		[3, "viewport"],
	])
		socket.send(JSON.stringify({ id, method }));
	await complete;
	expect(received).toEqual([1, 2, 3]);
});

test("malformed WebSocket frames close the client while the companion server stays usable", async () => {
	await connect();
	const closed = new Promise<number>((resolve) => socket.once("close", resolve));
	socket.send(Buffer.from([0xff]), { binary: false });
	expect(await closed).toBe(1007);
	expect((await fetch(`http://127.0.0.1:${server.port}/`)).status).toBe(200);
});

test("stop sharing closes even clients that have not sent a pairing message", async () => {
	await connect();
	const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
	server.stop();
	await closed;
	expect(server.code).toBe("");
	expect(server.list()).toEqual([]);
});

test("revocation prevents a queued operation from running", async () => {
	const action = await connect();
	const paired = message();
	socket.send(JSON.stringify({ type: "pair", code: server.code }));
	const device = await paired;
	const approved = message();
	await server.approve(device.deviceId);
	await approved;
	let release!: () => void;
	let entered!: () => void;
	const started = new Promise<void>((resolve) => {
		entered = resolve;
	});
	action.mockImplementationOnce(async () => {
		entered();
		await new Promise<void>((resolve) => {
			release = resolve;
		});
		return { state: { revision: 2 } };
	});
	socket.send(JSON.stringify({ id: 1, method: "scene" }));
	socket.send(JSON.stringify({ id: 2, method: "clear", input: { confirmed: true } }));
	await started;
	server.disconnect(device.deviceId);
	release();
	await new Promise((resolve) => setTimeout(resolve, 30));
	expect(action.mock.calls.some((call) => call[0] === "clear")).toBe(false);
});

test("companion may request visuals and sounds but never read/write API credentials", async () => {
	const action = await connect();
	const paired = message();
	socket.send(JSON.stringify({ type: "pair", code: server.code }));
	const p = await paired;
	const approved = message();
	await server.approve(p.deviceId);
	await approved;
	for (const method of ["aiSetKey", "aiTestKey", "aiAudio"]) {
		const rejected = message("error");
		socket.send(JSON.stringify({ id: 90, method, input: "secret" }));
		expect(await rejected).toMatchObject({ type: "error", id: 90 });
	}
	for (const method of ["laser", "captureStill", "soundboard", "aiInfo", "aiSearch"]) {
		const reply = message("reply");
		socket.send(JSON.stringify({ id: 91, method }));
		expect((await reply).type).toBe("reply");
		expect(action).toHaveBeenLastCalledWith(method, undefined, p.deviceId);
	}
});

test("bundled animated memes load on iPad and preference changes require pairing approval", async () => {
	const action = await connect();
	const dir = path.join(root, "assets/memes/starter-v1");
	await fs.mkdir(dir, { recursive: true });
	const gif = Buffer.from("GIF89a");
	await fs.writeFile(path.join(dir, "test.gif"), gif);
	const response = await fetch(
		`http://127.0.0.1:${server.port}/assets/memes/starter-v1/test.gif?v=123`,
	);
	expect(response.headers.get("content-type")).toBe("image/gif");
	expect(response.headers.get("cache-control")).toContain("immutable");
	expect(Buffer.from(await response.arrayBuffer())).toEqual(gif);
	const paired = message();
	socket.send(JSON.stringify({ type: "pair", code: server.code }));
	const device = await paired;
	const rejected = message("error");
	socket.send(
		JSON.stringify({
			id: 1,
			method: "setMemePreference",
			input: { kind: "love", value: true },
		}),
	);
	expect((await rejected).message).toContain("Approve");
	const approved = message("approved");
	await server.approve(device.deviceId);
	await approved;
	for (const method of ["setMemePreference", "restoreDefaultMemes"]) {
		const reply = message("reply");
		socket.send(JSON.stringify({ id: 2, method, input: {} }));
		await reply;
		expect(action).toHaveBeenLastCalledWith(method, {}, device.deviceId);
	}
});
