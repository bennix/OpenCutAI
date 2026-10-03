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
export async function deleteGeneratedAsset(id: string) {
	const { loadTasks } = await import("./tasks");
	if (
		(await loadTasks()).some(
			(task) =>
				task.assetId === id &&
				!["completed", "failed", "acknowledged"].includes(task.state),
		)
	)
		throw new Error("素材仍被可恢复的生成任务引用，不能清理");
	for (let index = 0; index < localStorage.length; index++) {
		const key = localStorage.key(index);
		if (!key?.startsWith("opencut-director-")) continue;
		const draft = JSON.parse(localStorage.getItem(key) ?? "{}");
		if (
			draft.plan?.shots?.some(
				(shot: {
					assetId?: string;
					firstFrameAssetId?: string;
					continuationFrameAssetId?: string;
				}) =>
					shot.assetId === id ||
					shot.firstFrameAssetId === id ||
					shot.continuationFrameAssetId === id,
			) ||
			draft.plan?.characters?.some(
				(card: { assetId?: string }) => card.assetId === id,
			)
		)
			throw new Error("素材仍被分镜或角色参考引用，请先解除引用");
	}
	return operation({ mode: "readwrite", fn: (s) => s.delete(id) });
}
export const getGeneratedAsset = (id: string) =>
	operation<GeneratedAsset | undefined>({
		mode: "readonly",
		fn: (s) => s.get(id),
	});

export async function libraryUsage() {
	const database = await db();
	return new Promise<{ bytes: number; count: number }>((resolve, reject) => {
		let bytes = 0,
			count = 0;
		const tx = database.transaction("assets", "readonly"),
			request = tx.objectStore("assets").openCursor();
		request.onsuccess = () => {
			const cursor = request.result;
			if (!cursor) return;
			bytes += cursor.value.blob.size;
			count++;
			cursor.continue();
		};
		tx.oncomplete = () => {
			database.close();
			resolve({ bytes, count });
		};
		tx.onabort = () => {
			database.close();
			reject(tx.error);
		};
	});
}
export async function pageGeneratedAssets(limit = 20, offset = 0) {
	const database = await db();
	return new Promise<GeneratedAsset[]>((resolve, reject) => {
		const rows: GeneratedAsset[] = [];
		let skipped = false;
		const tx = database.transaction("assets", "readonly"),
			request = tx.objectStore("assets").openCursor(null, "prev");
		request.onsuccess = () => {
			const cursor = request.result;
			if (!cursor || rows.length >= limit) return;
			if (offset > 0 && !skipped) {
				skipped = true;
				cursor.advance(offset);
				return;
			}
			rows.push(cursor.value);
			cursor.continue();
		};
		tx.oncomplete = () => {
			database.close();
			resolve(rows);
		};
		tx.onabort = () => {
			database.close();
			reject(tx.error);
		};
	});
}
