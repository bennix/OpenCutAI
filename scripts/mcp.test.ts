import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
test("MCP initializes, authenticates the bridge and dispatches tools", async () => {
	const transport = new StdioClientTransport({
		command: "bun",
		args: ["run", "scripts/mcp.ts"],
		env: {
			...process.env,
			OPENCUT_MCP_TOKEN: "test-bridge-token",
			OPENCUT_MCP_PORT: "13008",
			OPENCUT_EDITOR_ORIGIN: "http://localhost:3000",
		},
		stderr: "pipe",
	});
	const client = new Client({ name: "opencut-test", version: "1" });
	let ws: WebSocket | undefined;
	try {
		await client.connect(transport);
		const tools = await client.listTools();
		expect(tools.tools.map((t) => t.name)).toEqual([
			"list_project",
			"list_library",
			"get_storyboard",
			"plan_storyboard",
			"generate_storyboard_assets",
			"split_storyboard",
			"generate_character_card",
			"apply_storyboard",
			"generate_asset",
			"propose_edit",
			"apply_edit",
			"reuse_asset",
			"undo",
		]);
		expect(
			(await client.callTool({ name: "list_project", arguments: {} })).isError,
		).toBe(true);
		expect(
			(
				await fetch("http://127.0.0.1:13008/editor?token=wrong", {
					headers: { Origin: "http://localhost:3000" },
				})
			).status,
		).toBe(403);
		ws = new WebSocket("ws://127.0.0.1:13008/editor?token=test-bridge-token", {
			headers: { Origin: "http://localhost:3000" },
		});
		await new Promise<void>((resolve, reject) => {
			ws!.onopen = () => resolve();
			ws!.onerror = () => reject(new Error("Bridge failed"));
		});
		ws.onmessage = (event) => {
			const message = JSON.parse(String(event.data));
			ws!.send(
				JSON.stringify({
					id: message.id,
					result: {
						method: message.method,
						args: message.args,
						projectId: "fixture-project",
					},
				}),
			);
		};
		const result = await client.callTool({
			name: "generate_asset",
			arguments: {
				kind: "video",
				model: "minimax/minimax-h3-max",
				prompt: "waves",
			},
		});
		expect(result.isError).not.toBe(true);
		expect(JSON.stringify(result.content)).toContain("fixture-project");
		expect(JSON.stringify(result.content)).not.toContain("test-bridge-token");
		ws.close();
	} finally {
		ws?.close();
		await client.close();
	}
}, 20000);
