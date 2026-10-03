"use client";
import { useMemo, useSyncExternalStore } from "react";
import { DEFAULT_MODELS, type AiSettings } from "./settings";
function subscribe(onChange: () => void) {
	window.addEventListener("opencut-ai-settings", onChange);
	window.addEventListener("storage", onChange);
	return () => {
		window.removeEventListener("opencut-ai-settings", onChange);
		window.removeEventListener("storage", onChange);
	};
}
export function useAiSettings(): AiSettings {
	const raw = useSyncExternalStore(
		subscribe,
		() => localStorage.getItem("opencut-ai-settings"),
		() => null,
	);
	return useMemo(
		() =>
			raw
				? JSON.parse(raw)
				: { models: DEFAULT_MODELS, mcpEnabled: false, mcpToken: "" },
		[raw],
	);
}
