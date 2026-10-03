import "fake-indexeddb/auto";
import { expect, test } from "bun:test";
import {
	loadTasks,
	saveTask,
	updateTask,
	fingerprint,
	attachProviderTask,
} from "../tasks";
const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
	configurable: true,
	value: {
		getItem: (key: string) => values.get(key) ?? null,
		removeItem: (key: string) => values.delete(key),
	},
});
test("journal reload preserves submitted IDs, unknown attempts and binary references", async () => {
	const input = {
		kind: "video" as const,
		model: "minimax/minimax-h3-max",
		prompt: "scene",
		referenceImages: ["data:image/png;base64,fixture"],
	};
	const identity = await fingerprint(input, "project");
	expect(await fingerprint({ ...input, newVersion: true }, "project")).toBe(
		identity,
	);
	await saveTask({
		id: "journal-test",
		fingerprint: identity,
		input,
		projectId: "project",
		state: "unknown",
		created: 1,
		updated: 1,
	});
	expect((await loadTasks()).find((t) => t.id === "journal-test")?.state).toBe(
		"unknown",
	);
	await attachProviderTask("journal-test", "provider-task");
	expect(
		(await loadTasks()).find((t) => t.id === "journal-test")?.providerId,
	).toBe("provider-task");
	await updateTask("journal-test", { assetId: "saved-media", state: "saved" });
	expect(
		(await loadTasks()).find((t) => t.id === "journal-test")?.assetId,
	).toBe("saved-media");
	await expect(attachProviderTask("journal-test", "../bad")).rejects.toThrow();
});
