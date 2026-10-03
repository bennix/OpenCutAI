import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { ServerWebSocket } from "bun";
const token = process.env.OPENCUT_MCP_TOKEN ?? crypto.randomUUID();
const origins = process.env.OPENCUT_EDITOR_ORIGIN
	? [process.env.OPENCUT_EDITOR_ORIGIN]
	: ["http://localhost:3000", "http://localhost:3002"];
const port = Number(process.env.OPENCUT_MCP_PORT ?? 3008);
let editor: ServerWebSocket<unknown> | null = null;
const pending = new Map<
	string,
	{
		resolve: (value: unknown) => void;
		reject: (error: Error) => void;
		timer: ReturnType<typeof setTimeout>;
	}
>();
function disconnect() {
	for (const p of pending.values()) {
		clearTimeout(p.timer);
		p.reject(new Error("Editor disconnected"));
	}
	pending.clear();
	editor = null;
}
const bridge = Bun.serve({
	hostname: "127.0.0.1",
	port,
	fetch(request, server) {
		const url = new URL(request.url);
		if (
			url.pathname !== "/editor" ||
			url.searchParams.get("token") !== token ||
			!origins.includes(request.headers.get("origin") ?? "")
		)
			return new Response("Forbidden", { status: 403 });
		if (editor)
			return new Response("An editor is already connected", { status: 409 });
		return server.upgrade(request)
			? undefined
			: new Response("WebSocket required", { status: 400 });
	},
	websocket: {
		open(ws) {
			if (editor) {
				ws.close(1008, "An editor is already connected");
				return;
			}
			editor = ws;
			console.error("OpenCut editor connected");
		},
		close(ws) {
			if (editor === ws) disconnect();
		},
		message(ws, message) {
			if (ws !== editor) return;
			try {
				const data = JSON.parse(String(message)),
					p = pending.get(data.id);
				if (!p) return;
				clearTimeout(p.timer);
				pending.delete(data.id);
				if (data.error) p.reject(new Error(data.error));
				else p.resolve(data.result);
			} catch {
				console.error("Invalid editor bridge response");
			}
		},
	},
});
async function call(method: string, args: unknown) {
	if (!editor)
		throw new Error("Open editor, then enable MCP in Settings → ZenMux AI");
	return new Promise<unknown>((resolve, reject) => {
		const id = crypto.randomUUID();
		const timer = setTimeout(
			() => {
				pending.delete(id);
				editor?.send(JSON.stringify({ id, method: "cancel" }));
				reject(new Error("Editor operation timed out"));
			},
			35 * 60 * 1000,
		);
		pending.set(id, { resolve, reject, timer });
		editor!.send(JSON.stringify({ id, method, args }));
	});
}
const server = new McpServer({ name: "opencut-zenmux", version: "0.1.0" });
function tool(
	name: string,
	description: string,
	schema: Record<string, z.ZodType>,
) {
	server.registerTool(
		name,
		{ description, inputSchema: schema },
		async (args) => {
			try {
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(await call(name, args)),
						},
					],
				};
			} catch (error) {
				return {
					isError: true,
					content: [
						{
							type: "text" as const,
							text: error instanceof Error ? error.message : "Operation failed",
						},
					],
				};
			}
		},
	);
}
tool(
	"list_project",
	"List active project, scene, media metadata and timeline. No API keys or local file contents are returned.",
	{},
);
tool(
	"list_library",
	"List locally saved generated assets that can be reused across projects.",
	{},
);
tool(
	"get_storyboard",
	"Read the saved storyboard and visual style memory for the current scene.",
	{},
);
tool(
	"plan_storyboard",
	"Use the configured ZenMux planning model (paid usage) and Editorial Vision Studio presets to plan 1–12 coherent shots. Saves a draft; does not generate media or alter the timeline.",
	{
		model: z.string(),
		brief: z.string().min(1),
		preset: z.enum([
			"auto",
			"ivory-postcard",
			"vintage-travel-poster",
			"papercraft-diorama-postcard",
		]),
		ratio: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]),
		shotCount: z.number().int().min(1).max(12),
		outputKind: z.enum(["image", "video"]).optional(),
		videoModel: z
			.string()
			.optional()
			.describe(
				"Target configured video model; its saved duration limit controls storyboard planning",
			),
		maxShotSeconds: z.number().int().min(1).max(30).optional(),
	},
);
tool(
	"generate_storyboard_assets",
	"Generate missing storyboard shots through ZenMux (paid usage). Reuses completed shots, saves generated files locally, and resumes pending video jobs. Does not alter the timeline.",
	{
		kind: z.enum(["image", "video"]),
		model: z.string(),
		shotId: z.string().optional(),
		referenceModel: z.string().optional(),
	},
);
tool(
	"split_storyboard",
	"Split ungenerated storyboard shots using the configured video model maximum duration.",
	{ model: z.string() },
);
tool(
	"generate_character_card",
	"Generate a saved script character three-view card using ZenMux (paid usage). Supports up to three characters per storyboard.",
	{ characterId: z.string(), model: z.string() },
);
tool(
	"apply_storyboard",
	"Append the saved storyboard and its entrance/exit transitions to the current timeline in a single undoable batch. Requires every shot to have media.",
	{},
);
tool(
	"generate_asset",
	"Generate a paid image/video through the editor's saved ZenMux key, save locally, and import into the current project.",
	{
		kind: z.enum(["image", "video"]),
		model: z.string(),
		prompt: z.string().min(1),
		ratio: z.string().optional(),
		size: z.string().optional(),
		duration: z.number().int().min(1).max(120).optional(),
		resolution: z.string().optional(),
	},
);
tool(
	"propose_edit",
	"Create and validate an edit plan using media metadata and optional thumbnail images. Returns a plan ID and clips for review; does not alter the timeline.",
	{
		model: z.string(),
		prompt: z.string().min(1),
		includePreviews: z.boolean().optional(),
	},
);
tool(
	"apply_edit",
	"Apply a previously proposed plan to its original project and scene. Append sequential clips; undoable in one step.",
	{ planId: z.string() },
);
tool(
	"reuse_asset",
	"Import a saved AI library asset into the active project's media bin. The renderer adapts it to the canvas.",
	{ assetId: z.string() },
);
tool("undo", "Undo the most recent editor operation.", {});
console.error(`OpenCut MCP bridge: ws://127.0.0.1:${port}/editor`);
console.error(`Editor origins: ${origins.join(", ")}`);
console.error(`Connection token: ${token}`);
await server.connect(new StdioServerTransport());
process.stdin.on("end", () => {
	disconnect();
	bridge.stop(true);
});
