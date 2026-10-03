export interface GeneratedAsset {
	id: string;
	name: string;
	model: string;
	prompt: string;
	created: number;
	blob: Blob;
}
async function db(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const r = indexedDB.open("opencut-ai-library", 1);
		r.onupgradeneeded = () =>
			r.result.createObjectStore("assets", { keyPath: "id" });
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});
}
async function operation<T>({
	mode,
	fn,
}: {
	mode: IDBTransactionMode;
	fn: (s: IDBObjectStore) => IDBRequest<T>;
}): Promise<T> {
	const database = await db();
	return new Promise((resolve, reject) => {
		const tx = database.transaction("assets", mode),
			r = fn(tx.objectStore("assets"));
		tx.oncomplete = () => {
			database.close();
			resolve(r.result);
		};
		tx.onabort = () => {
			database.close();
			reject(tx.error);
		};
	});
}
export const listGeneratedAssets = () =>
	operation<GeneratedAsset[]>({ mode: "readonly", fn: (s) => s.getAll() });
export const saveGeneratedAsset = (asset: GeneratedAsset) =>
	operation({ mode: "readwrite", fn: (s) => s.put(asset) });
export const deleteGeneratedAsset = (id: string) =>
	operation({ mode: "readwrite", fn: (s) => s.delete(id) });
