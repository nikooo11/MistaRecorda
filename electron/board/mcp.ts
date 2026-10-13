import { createServer, type Server } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
export const DRAWING_GUIDE = `MistaRecorda drawing guide
Read board_get before changing a scene. Coordinates are canvas pixels; x increases right and y down. Preserve unrelated objects. Use board_draw to add editable shapes with stable IDs. Types: rectangle, ellipse, diamond, text, arrow, line, freedraw. Use 24–40px text, generous spacing, high contrast, and short labels. Arrows use points relative to x/y; position endpoints on shape edges. Group related shapes using matching groupIds. Apply related changes as one batch so undo remains useful. Use board_update to move, resize or recolor existing IDs. Call board_view to frame the diagram; zoom is shared by the desktop, iPad and recording. board_screenshot provides visual feedback; inspect it after edits if your client supports images. Save named scenes with board_save. Hiding the board never clears it. Clear only when the user explicitly asks. Images must be PNG/JPEG/WebP data URLs; never include credentials or fetch arbitrary URLs. The screen and opaque board have separate scenes. Prepare tutorials before recording. This server does not fetch or watch YouTube videos: obtain captions and relevant frames through your client's authorized capabilities, then translate the explanation into diagrams.
Example: create a rectangle at (100,150), ellipse at (500,150), labels inside them, and an arrow starting at (350,210) with points [[0,0],[140,0]]. Read and inspect the result; save as Introduction. Keep all content editable, and report any content you could not inspect.`;
export class DrawingMcpServer {
	server?: Server;
	token = "";
	url = "";
	constructor(readonly action: (method: string, input?: unknown) => Promise<unknown>) {}
	async start() {
		if (this.server) return { url: this.url, token: this.token };
		this.token = randomBytes(32).toString("base64url");
		this.server = createServer(async (req, res) => {
			const auth = req.headers.authorization ?? "";
			const expected = `Bearer ${this.token}`;
			if (
				Buffer.byteLength(auth) !== Buffer.byteLength(expected) ||
				!timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
			) {
				res.writeHead(401).end();
				return;
			}
			if (req.url !== "/mcp" || req.headers.origin) {
				res.writeHead(403).end();
				return;
			}
			const mcp = new McpServer(
				{ name: "mistarecorda-drawing", version: "1.0.0" },
				{ instructions: DRAWING_GUIDE },
			);
			mcp.registerResource(
				"drawing-guide",
				"mistarecorda://drawing-guide",
				{
					description:
						"Read before drawing: coordinates, layout, examples, persistence and shared zoom",
					mimeType: "text/plain",
				},
				async () => ({
					contents: [{ uri: "mistarecorda://drawing-guide", text: DRAWING_GUIDE }],
				}),
			);
			mcp.registerPrompt(
				"prepare-tutorial",
				{
					description: "Prepare an editable tutorial board",
					argsSchema: { topic: z.string() },
				},
				({ topic }) => ({
					messages: [
						{
							role: "user",
							content: {
								type: "text",
								text: `${DRAWING_GUIDE}\nPrepare a clear diagram for: ${topic}. Read the board, preserve unrelated work, inspect your layout and save a named scene.`,
							},
						},
					],
				}),
			);
			const tool = (
				name: string,
				description: string,
				schema: Record<string, z.ZodTypeAny>,
				method: string,
			) =>
				mcp.registerTool(name, { description, inputSchema: schema }, async (args) => {
					try {
						const data = await this.action(method, args);
						return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
					} catch (e) {
						return {
							isError: true,
							content: [
								{
									type: "text" as const,
									text:
										e instanceof Error ? e.message : "Drawing operation failed",
								},
							],
						};
					}
				});
			tool("board_get", "Read scene, IDs and shared viewport before editing", {}, "mcpGet");
			tool(
				"board_draw",
				"Add editable elements as a batch. Read the drawing-guide resource first.",
				{ elements: z.array(z.record(z.unknown())).min(1).max(200) },
				"draw",
			);
			tool(
				"board_update",
				"Update existing objects by ID; preserve unspecified properties",
				{ elements: z.array(z.record(z.unknown())).min(1).max(200) },
				"updateElements",
			);
			tool(
				"board_delete",
				"Delete only the specified object IDs",
				{ ids: z.array(z.string()).max(200) },
				"deleteElements",
			);
			tool(
				"board_view",
				"Set shared viewport, affecting desktop, iPad and recording",
				{ zoom: z.number().min(0.1).max(10), scrollX: z.number(), scrollY: z.number() },
				"viewport",
			);
			tool(
				"board_mode",
				"Choose opaque board or screen annotation scene",
				{ mode: z.enum(["screen", "board"]) },
				"mode",
			);
			tool("board_save", "Save a named prepared scene", { name: z.string() }, "saveScene");
			tool(
				"board_load",
				"Replace active scene with a named saved scene when requested",
				{ name: z.string() },
				"loadScene",
			);
			tool("board_list_scenes", "List available prepared scenes", {}, "listScenes");
			tool(
				"board_image",
				"Add an editable raster image; transparency is preserved",
				{
					dataURL: z.string(),
					x: z.number(),
					y: z.number(),
					width: z.number().positive(),
					height: z.number().positive(),
				},
				"image",
			);
			mcp.registerTool(
				"board_screenshot",
				{ description: "Inspect a clean board screenshot after drawing", inputSchema: {} },
				async () => ({
					content: [
						{
							type: "image",
							mimeType: "image/png",
							data: String(await this.action("screenshot")),
						},
					],
				}),
			);
			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
				enableJsonResponse: true,
			});
			try {
				await mcp.connect(transport);
				res.on("close", () => {
					void transport.close();
					void mcp.close();
				});
				await transport.handleRequest(req, res);
			} catch {
				if (!res.headersSent) res.writeHead(500);
				res.end();
			}
		});
		await new Promise<void>((resolve, reject) => {
			this.server!.once("error", reject);
			this.server!.listen(0, "127.0.0.1", () => resolve());
		});
		this.url = `http://127.0.0.1:${(this.server.address() as { port: number }).port}/mcp`;
		return { url: this.url, token: this.token };
	}
	stop() {
		this.server?.close();
		this.server = undefined;
		this.token = "";
		this.url = "";
	}
}
