"use client";
import { useEffect } from "react";
import { toast } from "sonner";
import { readBudget, refreshAccount, accountSnapshot } from "./budget";
export function BudgetMonitor() {
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let disposed = false;
		let warned = false;
		let revision = 0;
		const tick = async () => {
			const current = ++revision;
			const settings = readBudget();
			if (settings.enabled) {
				const value = await refreshAccount();
				if (disposed || current !== revision) return;
				if (value.balance !== null && value.balance <= settings.warnBalance) {
					if (!warned)
						toast.warning(`ZenMux 余额较低：US$ ${value.balance.toFixed(2)}`);
					warned = true;
				} else if (value.balance !== null) warned = false;
			}
			if (!disposed && current === revision)
				timer = setTimeout(
					tick,
					Math.max(60, readBudget().refreshSeconds) * 1000,
				);
		};
		const restart = () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(
				tick,
				Math.max(0, 60000 - (Date.now() - accountSnapshot().updated)),
			);
		};
		window.addEventListener("opencut-budget", restart);
		void tick();
		return () => {
			disposed = true;
			if (timer) clearTimeout(timer);
			window.removeEventListener("opencut-budget", restart);
		};
	}, []);
	return null;
}
