import { checkGenerationBudget } from "opencut-ai";
import { readApiKey } from "./settings";
export interface BudgetSettings {
	enabled: boolean;
	refreshSeconds: number;
	warnBalance: number;
	stopBalance?: number;
	monthlyLimit?: number;
	operationLimit?: number;
	requireKnown: boolean;
	apiKeyId: string;
	prices: Record<string, { unit: "second" | "request"; usd: number }>;
}
export const defaultBudget: BudgetSettings = {
	enabled: false,
	refreshSeconds: 300,
	warnBalance: 5,
	requireKnown: false,
	apiKeyId: "",
	prices: {},
};
export function readBudget(): BudgetSettings {
	const raw =
		typeof localStorage !== "undefined"
			? localStorage.getItem("opencut-ai-budget")
			: null;
	try {
		return raw
			? { ...defaultBudget, ...JSON.parse(raw) }
			: { ...defaultBudget };
	} catch {
		return { ...defaultBudget };
	}
}
export function saveBudget(settings: BudgetSettings) {
	localStorage.setItem("opencut-ai-budget", JSON.stringify(settings));
	window.dispatchEvent(new Event("opencut-budget"));
}
export interface AccountSnapshot {
	balance: number | null;
	monthlyCost: number | null;
	updated: number;
	error?: string;
}
let snapshot: AccountSnapshot = {
	balance: null,
	monthlyCost: null,
	updated: 0,
};
let refresh: Promise<AccountSnapshot> | undefined;
async function management(input: {
	action: "balance" | "cost";
	month?: string;
	apiKeyId?: string;
}) {
	if (window.opencutDesktop) {
		if (!window.opencutDesktop.aiManagement)
			throw new Error("请重启桌面应用以启用余额监控");
		return window.opencutDesktop.aiManagement(input);
	}
	const key = await readApiKey("management");
	if (!key)
		throw new Error("请保存 Management API Key，普通生成密钥不能查询余额");
	const response = await fetch("/api/zenmux/management", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: "Bearer " + key,
		},
		body: JSON.stringify(input),
		signal: AbortSignal.timeout(25000),
	});
	if (!response.ok) throw new Error(`Management API HTTP ${response.status}`);
	return response.json();
}
export async function refreshAccount() {
	if (refresh) return refresh;
	refresh = (async () => {
		const settings = readBudget();
		try {
			const now = new Date(),
				month = now.toISOString().slice(0, 7).replace("-", "");
			const [balance, cost] = await Promise.allSettled([
				management({ action: "balance" }),
				management({ action: "cost", month, apiKeyId: settings.apiKeyId }),
			]);
			const b = balance.status === "fulfilled" ? balance.value : null,
				c = cost.status === "fulfilled" ? cost.value : null;
			const value = b?.success === true ? b.data?.total_credits : null;
			const amount = c?.success === true ? c.data?.summary?.totalCost : null;
			snapshot = {
				balance:
					typeof value === "number" && Number.isFinite(value) ? value : null,
				monthlyCost:
					amount !== null &&
					amount !== undefined &&
					Number.isFinite(Number(amount))
						? Number(amount)
						: null,
				updated: Date.now(),
				error:
					[balance, cost]
						.filter((r) => r.status === "rejected")
						.map((r) =>
							r.status === "rejected"
								? r.reason instanceof Error
									? r.reason.message
									: String(r.reason)
								: "",
						)
						.join("；") || undefined,
			};
		} catch (e) {
			snapshot = {
				balance: null,
				monthlyCost: null,
				updated: Date.now(),
				error: e instanceof Error ? e.message : String(e),
			};
		}
		window.dispatchEvent(
			new CustomEvent("opencut-account", { detail: snapshot }),
		);
		return snapshot;
	})().finally(() => {
		refresh = undefined;
	});
	return refresh;
}
export function accountSnapshot() {
	return snapshot;
}
export function estimateGeneration(model: string, seconds?: number) {
	const price = readBudget().prices[model];
	if (!price || !Number.isFinite(price.usd) || price.usd < 0) return null;
	if (price.unit === "second" && (!seconds || seconds <= 0)) return null;
	return price.usd * (price.unit === "second" ? seconds! : 1);
}
export async function guardGeneration(model: string, seconds?: number) {
	const settings = readBudget();
	if (!settings.enabled) return;
	if (
		Date.now() - snapshot.updated >
		Math.max(60, settings.refreshSeconds) * 1000
	)
		await refreshAccount();
	const result = JSON.parse(
		checkGenerationBudget(
			JSON.stringify({
				balance: snapshot.balance,
				monthlyCost: snapshot.monthlyCost,
				stopBalance: settings.stopBalance,
				monthlyLimit: settings.monthlyLimit,
				estimatedCost: estimateGeneration(model, seconds),
				operationLimit: settings.operationLimit,
				requireKnown: settings.requireKnown,
			}),
		),
	);
	if (!result.allowed) throw new Error(result.reason);
}
