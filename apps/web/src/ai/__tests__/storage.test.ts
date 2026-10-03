/// <reference types="bun" />
import { expect, test } from "bun:test";
import "fake-indexeddb/auto";
import { readApiKey, saveApiKey } from "../settings";
import {
	listGeneratedAssets,
	saveGeneratedAsset,
	deleteGeneratedAsset,
} from "../library";
const storage=new Map<string,string>();Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key),key:(index:number)=>[...storage.keys()][index]??null,get length(){return storage.size;}}});
// Isolated in-memory IndexedDB; never the user's browser database.
test("credentials persist as ciphertext with a non-exportable key", async () => {
	await saveApiKey(" test-secret ");
	expect(await readApiKey()).toBe("test-secret");
	const db = await new Promise<IDBDatabase>((resolve) => {
		const r = indexedDB.open("opencut-ai-vault", 1);
		r.onsuccess = () => resolve(r.result);
	});
	const secret = await new Promise<{ key: CryptoKey; encrypted: ArrayBuffer }>(
		(resolve) => {
			const r = db.transaction("vault").objectStore("vault").get("secret");
			r.onsuccess = () => resolve(r.result);
		},
	);
	expect(secret.key.extractable).toBe(false);
	expect(new TextDecoder().decode(secret.encrypted)).not.toContain(
		"test-secret",
	);
	await expect(crypto.subtle.exportKey("raw", secret.key)).rejects.toThrow();
	db.close();
	await saveApiKey("");
	expect(await readApiKey()).toBe("");
});
test("generated binary files remain reusable independently of projects", async () => {
	const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "video/mp4" });
	await saveGeneratedAsset({
		id: "test-asset",
		name: "test.mp4",
		prompt: "waves",
		model: "minimax/minimax-h3-max",
		created: 1,
		blob,
	});
	const asset = (await listGeneratedAssets()).find(
		(a) => a.id === "test-asset",
	)!;
	expect(asset.blob.type).toBe("video/mp4");
	expect([...new Uint8Array(await asset.blob.arrayBuffer())]).toEqual([
		1, 2, 3, 4,
	]);
	await deleteGeneratedAsset("test-asset");
	expect(await listGeneratedAssets()).toHaveLength(0);
});
