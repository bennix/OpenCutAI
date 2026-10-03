"use client";
import { UiText, useTranslation, localize } from "@/i18n";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
	saveSettings,
	getDefaultModel,
	readApiKey,
	saveApiKey,
	isAiKind,
	type AiSettings,
	type AiKind,
} from "./settings";
import { useAiSettings } from "./use-settings";
import { StorageView } from "./storage-view";
import { TaskCenter } from "./task-center";
import { BudgetView } from "./budget-view";
import { readBudget, saveBudget } from "./budget";
import { zenmux } from "./transport";
export function AiSettingsView() {
	const t = useTranslation();
	const settings = useAiSettings();
	const [mcpStatus, setMcpStatus] = useState("未连接");
	const [key, setKey] = useState("");
	const [show, setShow] = useState(false);
	const [model, setModel] = useState("");
	const [kind, setKind] = useState<AiKind>("edit");
	const [busy, setBusy] = useState(false);
	const [available, setAvailable] = useState<string[] | null>(null);
	useEffect(() => {
		const onMcpStatus = (event: Event) => {
			if (event instanceof CustomEvent) setMcpStatus(event.detail);
		};
		window.addEventListener("opencut-mcp-status", onMcpStatus);
		if (!window.opencutDesktop)
			void readApiKey()
				.then(setKey)
				.catch(() => toast.error(localize("无法读取本地凭据")));
		return () => window.removeEventListener("opencut-mcp-status", onMcpStatus);
	}, []);
	if (!settings) return null;
	const update = (value: AiSettings) => {
		saveSettings(value);
	};
	return (
		<div className="space-y-4 p-3 text-sm">
			<h3 className="font-medium">ZenMux AI</h3>
			<p className="text-muted-foreground break-all">
				Base URL：https://zenmux.ai/api/v1
			</p>
			<label htmlFor="zenmux-key" className="block space-y-2">
				<UiText text="API Key" />
				<Input
					id="zenmux-key"
					type="password"
					value={key}
					onChange={(e) => setKey(e.target.value)}
					showPassword={show}
					onShowPasswordChange={setShow}
					autoComplete="off"
				/>
			</label>
			<div className="flex gap-2">
				<Button
					disabled={busy}
					onClick={async () => {
						setBusy(true);
						try {
							await saveApiKey(key);
							setKey("");
							toast.success(
								key.trim()
									? t("API Key 已加密保存到本机")
									: t("API Key 已删除"),
							);
						} catch {
							toast.error(t("保存失败，请检查浏览器存储权限"));
						} finally {
							setBusy(false);
						}
					}}
				>
					<UiText text="保存密钥" />
				</Button>
				<Button
					variant="outline"
					disabled={busy}
					onClick={async () => {
						setBusy(true);
						try {
							const data = await zenmux({ path: "/api/v1/models" });
							setAvailable(data.data.map((m: { id: string }) => m.id));
							toast.success(t("模型目录已更新；目录查询不能验证密钥权限"));
						} catch (e) {
							toast.error(e instanceof Error ? e.message : t("连接失败"));
						} finally {
							setBusy(false);
						}
					}}
				>
					<UiText text="刷新模型目录" />
				</Button>
			</div>
			<a
				className="text-primary underline"
				href="https://zenmux.ai/invite/GBQMC5"
				target="_blank"
				rel="noreferrer"
			>
				<UiText text="没有 API Key？通过邀请链接注册 ZenMux" />
			</a>
			<p className="text-muted-foreground text-xs">
				<UiText
					text={
						typeof window !== "undefined" && window.opencutDesktop
							? "桌面版使用系统保护的凭据存储，已保存密钥不会回传编辑器。输入新密钥可替换，保存空值可删除。"
							: "网页版凭据加密保存在此浏览器；页面脚本仍可使用凭据。清除站点数据会丢失设置。"
					}
				/>
			</p>
			<BudgetView />
			<TaskCenter />
			<StorageView />
			<h4 className="font-medium">
				<UiText text="Default generation models" />
			</h4>
			{(["image", "video"] as const).map((modelKind) => (
				<label
					className="block space-y-2"
					key={modelKind}
					htmlFor={`default-model-${modelKind}`}
				>
					<UiText
						text={
							modelKind === "image"
								? "Default image model"
								: "Default video model"
						}
					/>
					<select
						id={`default-model-${modelKind}`}
						className="w-full rounded border bg-background p-2"
						value={getDefaultModel({ settings, kind: modelKind })}
						disabled={!settings.models.some((item) => item.kind === modelKind)}
						onChange={(event) =>
							update({
								...settings,
								defaultModels: {
									...settings.defaultModels,
									[modelKind]: event.target.value,
								},
							})
						}
					>
						{!settings.models.some((item) => item.kind === modelKind) && (
							<option value="">{t("No models configured")}</option>
						)}
						{settings.models
							.filter((item) => item.kind === modelKind)
							.map((item, index) => (
								<option key={`${item.id}-${index}`} value={item.id}>
									{item.id}
								</option>
							))}
					</select>
				</label>
			))}
			<p className="text-xs text-muted-foreground">
				<UiText text="Saved locally. AI generation and storyboard use these defaults; you can choose another model for each task." />
			</p>
			<h4 className="font-medium">
				<UiText text="模型管理" />
			</h4>
			<label htmlFor="zenmux-model" className="block">
				<UiText text="新模型名称" />
				<Input
					id="zenmux-model"
					value={model}
					placeholder="provider/model-name"
					onChange={(e) => setModel(e.target.value)}
				/>
			</label>
			<label className="block">
				<UiText text="模型用途" />
				<select
					className="bg-background border rounded p-2 ml-2"
					value={kind}
					onChange={(e) => isAiKind(e.target.value) && setKind(e.target.value)}
				>
					<option value="edit">
						<UiText text="AI 剪辑" />
					</option>
					<option value="image">
						<UiText text="生图" />
					</option>
					<option value="video">
						<UiText text="视频" />
					</option>
				</select>
			</label>
			<Button
				variant="outline"
				onClick={() => {
					if (!/^[\w-]+\/[\w.-]+$/.test(model.trim()) || model.includes("..")) {
						toast.error(t("请输入 provider/model 格式"));
						return;
					}
					if (
						settings.models.some(
							(m) => m.id === model.trim() && m.kind === kind,
						)
					)
						return;
					update({
						...settings,
						models: [...settings.models, { id: model.trim(), kind }],
					});
					setModel("");
				}}
			>
				<UiText text="添加模型" />
			</Button>
			{settings.models.map((m, index) => (
				<div key={index} className="flex items-center gap-2">
					<Input
						aria-label={t("模型名称")}
						value={m.id}
						onChange={(e) =>
							update({
								...settings,
								models: settings.models.map((item, i) =>
									i === index ? { ...item, id: e.target.value } : item,
								),
								defaultModels:
									m.kind !== "edit" &&
									getDefaultModel({ settings, kind: m.kind }) === m.id
										? { ...settings.defaultModels, [m.kind]: e.target.value }
										: settings.defaultModels,
							})
						}
					/>
					<span className="text-xs shrink-0">
						<UiText
							text={
								m.kind === "edit"
									? t("剪辑")
									: m.kind === "image"
										? t("生图")
										: t("视频")
							}
						/>
						{available && (available.includes(m.id) ? " ✓" : ` ${t("未列出")}`)}
					</span>
					{m.kind !== "edit" && (
						<label className="text-xs">
							价格估算（USD / {m.kind === "video" ? "秒" : "次"}）
							<Input
								type="number"
								min={0}
								step="any"
								defaultValue={readBudget().prices[m.id]?.usd ?? ""}
								onChange={(e) => {
									const budget = readBudget();
									const prices = { ...budget.prices };
									if (e.target.value === "") delete prices[m.id];
									else {
										const usd = Number(e.target.value);
										if (!Number.isFinite(usd) || usd < 0) return;
										prices[m.id] = {
											unit: m.kind === "video" ? "second" : "request",
											usd,
										};
									}
									saveBudget({ ...budget, prices });
								}}
							/>
						</label>
					)}
					{m.kind === "video" && (
						<label className="text-xs" htmlFor={`model-duration-${index}`}>
							<UiText text="Model max shot seconds" />
							<Input
								id={`model-duration-${index}`}
								type="number"
								min={m.id === "minimax/minimax-h3-max" ? 5 : 1}
								max={m.id === "minimax/minimax-h3-max" ? 15 : 30}
								value={m.maxShotSeconds ?? ""}
								onChange={(event) =>
									update({
										...settings,
										models: settings.models.map((item, i) =>
											i === index
												? {
														...item,
														maxShotSeconds: event.target.value
															? Math.max(
																	m.id === "minimax/minimax-h3-max" ? 5 : 1,
																	Math.min(
																		m.id === "minimax/minimax-h3-max" ? 15 : 30,
																		Number(event.target.value),
																	),
																)
															: undefined,
													}
												: item,
										),
									})
								}
							/>
						</label>
					)}
					<Button
						variant="ghost"
						size="sm"
						aria-label={`${t("删除")} ${m.id}`}
						onClick={() =>
							update({
								...settings,
								models: settings.models.filter((_, i) => i !== index),
							})
						}
					>
						<UiText text="删除" />
					</Button>
				</div>
			))}
			<h4 className="font-medium">
				<UiText text="MCP 本机连接" />
			</h4>
			<p role="status" className="text-xs">
				<UiText text={mcpStatus} />
			</p>
			<p className="text-xs text-muted-foreground">
				<UiText text="运行 bun run mcp，再使用终端显示的连接令牌。连接后 MCP 客户端可生成收费素材并修改当前项目；请只连接可信客户端。" />
			</p>
			<label htmlFor="zenmux-mcp-token" className="block">
				<UiText text="连接令牌" />
				<Input
					id="zenmux-mcp-token"
					type="password"
					value={settings.mcpToken}
					onChange={(e) => update({ ...settings, mcpToken: e.target.value })}
				/>
			</label>
			<label className="flex gap-2">
				<input
					type="checkbox"
					checked={settings.mcpEnabled}
					onChange={(e) =>
						update({ ...settings, mcpEnabled: e.target.checked })
					}
				/>
				<UiText text="允许 MCP 访问当前编辑器" />
			</label>
		</div>
	);
}
