import { expect, test } from "vitest";
import { DrawingMcpServer } from "./mcp";
test("MCP requires the session token and exposes drawing guide, tools and editable scene data", async () => {
	const server = new DrawingMcpServer(async () => ({ elements: [{ id: "editable" }] }));
	const { url, token } = await server.start();
	try {
		const send = (body: unknown, auth = true) =>
			fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json, text/event-stream",
					...(auth ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify(body),
			});
		expect((await send({ jsonrpc: "2.0", id: 0, method: "tools/list" }, false)).status).toBe(
			401,
		);
		const init = await (
			await send({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-03-26",
					capabilities: {},
					clientInfo: { name: "test", version: "1" },
				},
			})
		).json();
		expect(init.result.instructions).toContain("Read board_get");
		const tools = await (await send({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
		expect(tools.result.tools.map((t: { name: string }) => t.name)).toContain(
			"board_screenshot",
		);
		const draw = await (
			await send({
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: { name: "board_get", arguments: {} },
			})
		).json();
		expect(draw.result.content[0].text).toContain("editable");
	} finally {
		server.stop();
	}
});
