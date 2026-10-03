"use client";
import { useEffect } from "react";
import { useEditor } from "@/editor/use-editor";
import { loadSettings } from "./settings";
import {
	generate,
	assetMetadata,
	applyEditPlan,
	importGenerated,
	type EditPlan,
} from "./editor-adapter";
import {
	planStoryboard,
	generateStoryboardAssets,
	applyStoryboard,
	loadDirectorDraft,
	splitStoryboardForModel,
	generateCharacterCard,
} from "./director";
import { listGeneratedAssets } from "./library";
import { toast } from "sonner";
export function useMcpBridge() {
	const editor = useEditor();
	useEffect(() => {
		let socket: WebSocket | null = null,
			retry: ReturnType<typeof setTimeout> | undefined;
		let connectionKey = "";
		let disposed = false,
			busy = false;
		const operations = new Map<string, AbortController>();
		const plans = new Map<
			string,
			{ plan: EditPlan; projectId: string; sceneId: string }
		>();
		const status = (value: string) =>
			window.dispatchEvent(
				new CustomEvent("opencut-mcp-status", { detail: value }),
			);
		function connect() {
			clearTimeout(retry);
			socket?.close();
			socket = null;
			for (const c of operations.values()) c.abort();
			plans.clear();
			const settings = loadSettings();
			if (disposed || !settings.mcpEnabled || !settings.mcpToken) {
				status("未连接");
				return;
			}
			const ws = new WebSocket(
				`ws://127.0.0.1:3008/editor?token=${encodeURIComponent(settings.mcpToken)}`,
			);
			socket = ws;
			ws.onopen = () => status("已连接");
			ws.onerror = () => status("连接失败，请检查 MCP 服务和令牌");
			ws.onclose = () => {
				if (socket !== ws) return;
				status("连接已断开");
				for (const c of operations.values()) c.abort();
				if (!disposed) retry = setTimeout(connect, 3000);
			};
			ws.onmessage = async (event) => {
				const message = JSON.parse(event.data);
				if (message.method === "cancel") {
					operations.get(message.id)?.abort();
					return;
				}
				const controller = new AbortController();
				const reply = (value: { result?: unknown; error?: string }) => {
					if (ws.readyState === WebSocket.OPEN && !controller.signal.aborted)
						ws.send(JSON.stringify({ id: message.id, ...value }));
				};
				if (busy) {
					reply({ error: "Another MCP operation is running" });
					return;
				}
				busy = true;
				operations.set(message.id, controller);
				try {
					const args = message.args ?? {};
					let result: unknown;
					switch (message.method) {
						case "plan_storyboard":
							result = await planStoryboard({
								editor,
								...args,
								signal: controller.signal,
							});
							break;
						case "split_storyboard":
						case "generate_character_card":
						case "get_storyboard":
						case "generate_storyboard_assets":
						case "apply_storyboard": {
							const draft = loadDirectorDraft({
								projectId: editor.project.getActive().metadata.id,
								sceneId: editor.scenes.getActiveScene().id,
							});
							if (!draft)
								throw new Error("No storyboard saved for the current scene");
							if (message.method === "get_storyboard") result = draft;
							else if (message.method === "split_storyboard")
								result = splitStoryboardForModel({ draft, model: args.model });
							else if (message.method === "generate_character_card")
								result = await generateCharacterCard({
									editor,
									draft,
									...args,
									signal: controller.signal,
									status,
								});
							else if (message.method === "generate_storyboard_assets")
								result = await generateStoryboardAssets({
									editor,
									draft,
									...args,
									signal: controller.signal,
									status,
								});
							else {
								applyStoryboard({ editor, draft });
								result = { applied: true };
							}
							break;
						}
						case "list_project":
							result = {
								projectId: editor.project.getActive().metadata.id,
								sceneId: editor.scenes.getActiveScene().id,
								assets: assetMetadata(editor),
								tracks: editor.scenes.getActiveScene().tracks,
							};
							break;
						case "list_library":
							result = (await listGeneratedAssets()).map(
								({ blob, ...meta }) => ({
									...meta,
									mime: blob.type,
									size: blob.size,
								}),
							);
							break;
						case "generate_asset":
						case "propose_edit": {
							const kind =
								message.method === "propose_edit" ? "edit" : args.kind;
							if (
								!loadSettings().models.some(
									(m) => m.id === args.model && m.kind === kind,
								)
							)
								throw new Error("Model is not configured for this task");
							const projectId = editor.project.getActive().metadata.id,
								sceneId = editor.scenes.getActiveScene().id;
							const value = await generate({
								editor,
								input: { ...args, kind },
								signal: controller.signal,
								status,
							});
							if (typeof value === "string") result = { assetId: value };
							else {
								const planId = crypto.randomUUID();
								plans.set(planId, { plan: value, projectId, sceneId });
								result = { planId, ...value };
							}
							break;
						}
						case "apply_edit": {
							const saved = plans.get(args.planId);
							if (
								!saved ||
								saved.projectId !== editor.project.getActive().metadata.id ||
								saved.sceneId !== editor.scenes.getActiveScene().id
							)
								throw new Error("Plan is missing or project/scene changed");
							applyEditPlan({ editor, plan: saved.plan });
							plans.delete(args.planId);
							result = { applied: true };
							break;
						}
						case "reuse_asset": {
							const asset = (await listGeneratedAssets()).find(
								(a) => a.id === args.assetId,
							);
							if (!asset) throw new Error("Asset not found");
							result = { mediaId: await importGenerated({ editor, asset }) };
							break;
						}
						case "undo":
							editor.command.undo();
							result = { undone: true };
							break;
						default:
							throw new Error("Unknown MCP tool");
					}
					reply({ result });
					status("已连接 · 操作完成");
					if (!["list_project", "list_library"].includes(message.method))
						toast.success(`MCP: ${message.method} 完成`);
				} catch (e) {
					reply({
						error: e instanceof Error ? e.message : "MCP operation failed",
					});
				} finally {
					busy = false;
					operations.delete(message.id);
				}
			};
		}
		const onSettingsChange = () => {
			const settings = loadSettings();
			const next = `${settings.mcpEnabled}:${settings.mcpToken}`;
			if (next !== connectionKey) {
				connectionKey = next;
				connect();
			}
		};
		onSettingsChange();
		window.addEventListener("opencut-ai-settings", onSettingsChange);
		return () => {
			disposed = true;
			clearTimeout(retry);
			window.removeEventListener("opencut-ai-settings", onSettingsChange);
			socket?.close();
			for (const c of operations.values()) c.abort();
		};
	}, [editor]);
}
