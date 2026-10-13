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
function message() {
	return new Promise<{ type: string; message: string; deviceId: string }>((r) =>
		socket.once("message", (b) => r(JSON.parse(b.toString()))),
	);
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
	next = message();
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
