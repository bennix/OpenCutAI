"use client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { saveApiKey } from "./settings";
import {
	accountSnapshot,
	readBudget,
	saveBudget,
	refreshAccount,
	type BudgetSettings,
} from "./budget";
export function BudgetView() {
	const [settings, setSettings] = useState<BudgetSettings>(() => readBudget());
	const [account, setAccount] = useState(accountSnapshot);
	const [key, setKey] = useState("");
	const [busy, setBusy] = useState(false);
	const update = (value: BudgetSettings) => {
		const next = { ...value, prices: readBudget().prices };
		saveBudget(next);
		setSettings(next);
	};
	useEffect(() => {
		const changed = () => setAccount(accountSnapshot());
		window.addEventListener("opencut-account", changed);
		return () => window.removeEventListener("opencut-account", changed);
	}, []);
	const amount = (value: number | null) =>
		value === null ? "未知" : `US$ ${value.toFixed(2)}`;
	return (
		<section className="space-y-3 border-t pt-4">
			<h4 className="font-medium">余额与生成预算</h4>
			<a
				href="https://zenmux.ai/platform/management"
				target="_blank"
				rel="noreferrer"
				className="text-primary underline"
			>
				创建 Management API Key
			</a>
			<p className="text-xs text-muted-foreground">
				管理密钥与生成密钥分开保存。余额接口不接受普通生成密钥；费用查询需个人直接创建的管理密钥。
			</p>
			<label className="block space-y-1">
				Management API Key
				<Input
					type="password"
					autoComplete="off"
					value={key}
					placeholder="输入新密钥以保存或替换"
					onChange={(e) => setKey(e.target.value)}
				/>
			</label>
			<div className="flex flex-wrap gap-2">
				<Button
					disabled={busy || !key.trim()}
					onClick={async () => {
						setBusy(true);
						try {
							await saveApiKey(key, "management");
							setKey("");
							toast.success("管理密钥已保存");
						} catch (e) {
							toast.error(e instanceof Error ? e.message : "保存失败");
						} finally {
							setBusy(false);
						}
					}}
				>
					保存管理密钥
				</Button>
				<Button
					variant="outline"
					disabled={busy}
					onClick={async () => {
						setBusy(true);
						try {
							await refreshAccount();
						} finally {
							setBusy(false);
						}
					}}
				>
					立即查询
				</Button>
				<Button
					variant="ghost"
					disabled={busy}
					onClick={async () => {
						await saveApiKey("", "management");
						toast.success("管理密钥已删除");
					}}
				>
					删除管理密钥
				</Button>
			</div>
			<div role="status" className="rounded border p-3 space-y-1">
				<p>账户余额：{amount(account.balance)}</p>
				<p>本月 PAYG 费用：{amount(account.monthlyCost)}</p>
				{account.updated > 0 && (
					<p className="text-xs">
						更新于 {new Date(account.updated).toLocaleString()}
					</p>
				)}
				{account.error && <p className="text-destructive">{account.error}</p>}
			</div>
			<label className="flex gap-2">
				<input
					type="checkbox"
					checked={settings.enabled}
					onChange={(e) => update({ ...settings, enabled: e.target.checked })}
				/>
				启用余额监控与生成预算检查
			</label>
			{(
				[
					["refreshSeconds", "自动刷新间隔（秒，至少 60）"],
					["warnBalance", "低余额提醒（USD）"],
					["stopBalance", "低于此余额停止新生成（USD）"],
					["monthlyLimit", "本月费用上限（USD）"],
					["operationLimit", "单次预计费用上限（USD）"],
				] as const
			).map(([field, label]) => (
				<label key={field} className="block space-y-1">
					{label}
					<Input
						type="number"
						min={field === "refreshSeconds" ? 60 : 0}
						step="any"
						value={settings[field] ?? ""}
						placeholder="不设置"
						onChange={(e) => {
							const value =
								e.target.value === "" ? undefined : Number(e.target.value);
							if (value !== undefined && (!Number.isFinite(value) || value < 0))
								return;
							update({
								...settings,
								[field]:
									field === "refreshSeconds"
										? Math.max(60, value ?? 300)
										: field === "warnBalance"
											? (value ?? 5)
											: value,
							});
						}}
					/>
				</label>
			))}
			<label className="block space-y-1">
				生成密钥资源 ID（可选）
				<Input
					value={settings.apiKeyId}
					placeholder="资源 ID，不是密钥文本"
					onChange={(e) =>
						update({ ...settings, apiKeyId: e.target.value.trim() })
					}
				/>
			</label>
			<label className="flex gap-2">
				<input
					type="checkbox"
					checked={settings.requireKnown}
					onChange={(e) =>
						update({ ...settings, requireKnown: e.target.checked })
					}
				/>
				无法估算生成费用时阻止提交
			</label>
			<p className="text-xs text-muted-foreground">
				未指定资源 ID 时，费用包含整个账户的 PAYG
				请求，不代表本应用或单个任务的花费。预算是客户端提交检查，不能保证服务商最终账单上限。模型费用估算须在下方配置。
			</p>
		</section>
	);
}
