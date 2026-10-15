import { createServer, type Server } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { canvasNoteSchema, linkSchema } from "./presenter";
export const DRAWING_GUIDE = `MistaRecorda drawing guide
Read board_get before changing a scene. Coordinates are canvas pixels; x increases right and y down. Preserve unrelated objects. Use board_draw to add editable shapes with stable IDs. Types: rectangle, ellipse, diamond, text, arrow, line, freedraw. Use 24–40px text, generous spacing, high contrast, and short labels. Arrows use points relative to x/y; position endpoints on shape edges. Group related shapes using matching groupIds. Apply related changes as one batch so undo remains useful. Use board_update to move, resize or recolor existing IDs. Call board_view to frame the diagram; zoom is shared by the desktop, iPad and recording. board_screenshot provides visual feedback; inspect it after edits if your client supports images. Save named scenes with board_save. Hiding the board never clears it. Clear only when the user explicitly asks. Images must be PNG/JPEG/WebP data URLs; never include credentials or fetch arbitrary URLs. The screen and opaque board have separate scenes. Prepare tutorials before recording. This server does not fetch or watch YouTube videos: obtain captions and relevant frames through your client's authorized capabilities, then translate the explanation into diagrams.
Example: create a rectangle at (100,150), ellipse at (500,150), labels inside them, and an arrow starting at (350,210) with points [[0,0],[140,0]]. Read and inspect the result; save as Introduction. Keep all content editable, and report any content you could not inspect.
Presenter environments: board_get includes presenter notes, references, preferences and private object metadata. Add shadow:true to board_draw elements or board_image to keep them at 50% opacity on the iPad only. Set note:true on text elements to default to shadow; enter can be none/fade/spin/fall. Never reveal a private object unless the user requests it. board_shadow changes selected IDs with the current revision from board_get. Optional mode on draw/image/update/delete prepares screen or board without changing the active output. Shadows are excluded from board_screenshot; inspect their geometry in board_get and the iPad preview. A clean screenshot verifies they stayed private.
Use presenter_note for reusable canvas notes, presenter_link for named Chrome links (URL, exact text, or section anchor), presenter_preference for shadow/width/entrance settings, and presenter_notes to save bullet points (**bold**, @{token} references mapped to kind/id). Read notesVersion before editing notes. Use presentation_save to bundle both canvases, media and notes. presentation_load/import replace both canvases and back up the previous environment; only do this when the user requests it. Never embed credentials or copyrighted assets without appropriate rights. An authorized screenshot can be imported with board_image shadow:true, then add separate editable labels and shapes; a screenshot alone does not make its contents editable. Use your client’s authorized screenshot/vision capabilities to reconstruct the scene, then verify positions. Link objects open in the user’s Chrome session; logged-in web pages cannot be embedded into the board.
Example presentation workflow: board_get; board_image(mode:board, shadow:true, dataURL:<authorized screenshot>, x:80,y:80,width:900,height:500); board_draw(mode:board,elements:[{type:text,text:"Explain the trend",x:100,y:620,note:true,enter:"fade"}]); presenter_notes(version:<notesVersion>,notes:{body:"- **Key point**",references:{}}); presentation_save(name:"Trend explanation").`;
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
						return {
							content: [
								{
									type: "text" as const,
									text: JSON.stringify(data, (key, value) =>
										key === "dataURL" ? undefined : value,
									),
								},
							],
						};
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
				{
					mode: z.enum(["screen", "board"]).optional(),
					elements: z.array(z.record(z.unknown())).min(1).max(200),
				},
				"draw",
			);
			tool(
				"board_update",
				"Update existing objects by ID; preserve unspecified properties",
				{
					mode: z.enum(["screen", "board"]).optional(),
					elements: z.array(z.record(z.unknown())).min(1).max(200),
				},
				"updateElements",
			);
			tool(
				"board_delete",
				"Delete only the specified object IDs",
				{ mode: z.enum(["screen", "board"]).optional(), ids: z.array(z.string()).max(200) },
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
					mode: z.enum(["screen", "board"]).optional(),
					shadow: z.boolean().optional(),
					enter: z.enum(["none", "fade", "spin", "fall"]).optional(),
					x: z.number(),
					y: z.number(),
					width: z.number().positive(),
					height: z.number().positive(),
				},
				"image",
			);
			tool(
				"board_shadow",
				"Hide or reveal selected objects and every member of their groups together. Reveal only when requested. Read board_get revision first.",
				{
					mode: z.enum(["screen", "board"]),
					ids: z.array(z.string()).min(1).max(200),
					shadow: z.boolean(),
					revision: z.number().int(),
					enter: z.enum(["none", "fade", "spin", "fall"]).optional(),
				},
				"setObjectShadow",
			);
			tool(
				"presenter_note",
				"Create or update a reusable canvas note. Notes default to shadow when placed.",
				canvasNoteSchema.shape,
				"saveCanvasNote",
			);
			tool(
				"presenter_link",
				"Create or update a named Chrome link; does not open it.",
				linkSchema.innerType().shape,
				"savePresenterLink",
			);
			tool(
				"presenter_preference",
				"Set object defaults, using key kind:id from board_get.",
				{
					key: z.string(),
					preference: z.object({
						name: z.string().optional(),
						widthPercent: z.number().min(5).max(100).optional(),
						shadow: z.boolean().optional(),
						enter: z.enum(["none", "fade", "spin", "fall"]).optional(),
					}),
				},
				"saveObjectPreference",
			);
			tool(
				"presenter_notes",
				"Save talking points with stable @{token} references; version is presenter.notesVersion from board_get.",
				{
					version: z.number().int(),
					notes: z.object({
						body: z.string().max(40000),
						references: z.record(
							z.object({
								kind: z.enum(["image", "meme", "sound", "link", "note"]),
								id: z.string(),
							}),
						),
					}),
				},
				"saveTalkingNotes",
			);
			tool(
				"presentation_save",
				"Save both canvases, media and talking points as a portable environment on the computer.",
				{ name: z.string() },
				"savePresentation",
			);
			tool("presentation_list", "List saved environments.", {}, "listPresentations");
			tool(
				"presentation_load",
				"Replace both canvases and talking points with a saved environment when requested; previous state is backed up.",
				{ name: z.string(), confirmed: z.literal(true) },
				"loadPresentation",
			);
			tool(
				"presentation_import",
				"Import a complete mistarecorda-presentation JSON bundle when requested; excludes keys and file paths.",
				{ bundle: z.record(z.unknown()), confirmed: z.literal(true) },
				"importPresentation",
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
