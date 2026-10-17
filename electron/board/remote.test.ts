import { afterEach, expect, test, vi } from "vitest";
import { RemoteControlServer, RemoteStaging } from "./remote";
let server: RemoteControlServer;
afterEach(() => server?.stop());
test("private staging cannot cross controllers or deploy twice", () => {
	const s = new RemoteStaging();
	const armed = s.stage("ipad", { kind: "meme", id: "m", name: "Meme" });
	expect(s.get("phone")).toBe(null);
	expect(() => s.take("phone", armed.token)).toThrow("no longer staged");
	expect(s.take("ipad", armed.token)).toEqual(armed);
	expect(() => s.take("ipad", armed.token)).toThrow();
});
test("replacing or cancelling a staged reference invalidates an old deploy request", () => {
	const s = new RemoteStaging();
	const first = s.stage("ipad", { kind: "sound", id: "s", name: "Sound" });
	s.stage("ipad", { kind: "meme", id: "m", name: "Meme" });
	expect(() => s.take("ipad", first.token)).toThrow();
	s.cancel("ipad");
	expect(s.get("ipad")).toBe(null);
});
test("Stream Deck bridge is loopback, bearer protected and disallows browser origins and arbitrary IPC", async () => {
	const action = vi.fn(async () => ({ accepted: true }));
	server = new RemoteControlServer(() => ({ status: { recording: false } }), action);
	const { url, token } = await server.start();
	expect(server.server?.address()).toMatchObject({ address: "127.0.0.1" });
	expect((await fetch(url + "/status")).status).toBe(403);
	const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
	expect(
		(await fetch(url + "/status", { headers: { ...headers, Origin: "https://evil.example" } }))
			.status,
	).toBe(403);
	expect((await fetch(url + "/status", { headers })).status).toBe(200);
	expect(
		(
			await fetch(url + "/action", {
				method: "POST",
				headers,
				body: JSON.stringify({ action: "mcp", input: true }),
			})
		).status,
	).toBe(400);
	expect(action).not.toHaveBeenCalled();
	expect(
		(
			await fetch(url + "/action", {
				method: "POST",
				headers,
				body: JSON.stringify({ action: "record", intent: "start" }),
			})
		).status,
	).toBe(200);
	expect(action).toHaveBeenCalledWith({ action: "record", intent: "start" });
	expect(
		(await fetch(url + "/action", { method: "POST", headers, body: "x".repeat(9000) })).status,
	).toBe(413);
});
