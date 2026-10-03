export interface SpoolEntry {
	id: string;
	name: string;
	mime: string;
	primary: boolean;
	created: number;
	complete: boolean;
	bytes: number;
}
async function root() {
	return (await navigator.storage.getDirectory()).getDirectoryHandle(
		"recording-recovery",
		{ create: true },
	);
}
async function folder(id: string) {
	if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid recording ID");
	return (await root()).getDirectoryHandle(id);
}
async function metadata(
	directory: FileSystemDirectoryHandle,
): Promise<SpoolEntry> {
	return JSON.parse(
		await (await directory.getFileHandle("manifest.json"))
			.getFile()
			.then((f) => f.text()),
	);
}
async function write(
	directory: FileSystemDirectoryHandle,
	name: string,
	blob: Blob,
) {
	const stream = await (
		await directory.getFileHandle(name, { create: true })
	).createWritable();
	try {
		await stream.write(blob);
		await stream.close();
	} catch (e) {
		await stream.abort();
		throw e;
	}
}
export async function beginSpool(input: {
	name: string;
	mime: string;
	primary: boolean;
}): Promise<string> {
	const desktop = window.opencutDesktop;
	if (desktop) {
		if (!desktop.recordingBegin)
			throw new Error(
				"Restart the desktop app to enable recoverable recording",
			);
		return desktop.recordingBegin(input);
	}
	const id = crypto.randomUUID(),
		directory = await (await root()).getDirectoryHandle(id, { create: true });
	await write(
		directory,
		"manifest.json",
		new Blob([
			JSON.stringify({
				...input,
				id,
				created: Date.now(),
				complete: false,
				bytes: 0,
			}),
		]),
	);
	await navigator.storage.persist();
	return id;
}
export async function appendSpool(id: string, index: number, blob: Blob) {
	if (window.opencutDesktop)
		return window.opencutDesktop.recordingAppend({
			id,
			bytes: await blob.arrayBuffer(),
		});
	await write(
		await folder(id),
		`${String(index).padStart(10, "0")}.webm`,
		blob,
	);
}
export async function finishSpool(id: string) {
	if (window.opencutDesktop) {
		await window.opencutDesktop.recordingFinish(id);
		return;
	}
	const directory = await folder(id),
		entry = await metadata(directory);
	await write(
		directory,
		"manifest.json",
		new Blob([JSON.stringify({ ...entry, complete: true })]),
	);
}
export async function listSpools(): Promise<SpoolEntry[]> {
	if (window.opencutDesktop) return window.opencutDesktop.recordingList();
	const result: SpoolEntry[] = [];
	for await (const directory of (await root()).values()) {
		if (directory.kind !== "directory") continue;
		try {
			const entry = await metadata(directory as FileSystemDirectoryHandle);
			let bytes = 0;
			for await (const h of (directory as FileSystemDirectoryHandle).values())
				if (h.kind === "file" && h.name.endsWith(".webm"))
					bytes += (await (h as FileSystemFileHandle).getFile()).size;
			result.push({ ...entry, bytes });
		} catch {}
	}
	return result;
}
export async function readSpool(id: string): Promise<File> {
	if (window.opencutDesktop) {
		const entry = await window.opencutDesktop.recordingRead(id);
		return new File([entry.bytes], `${entry.name}.webm`, { type: entry.mime });
	}
	const directory = await folder(id),
		entry = await metadata(directory),
		files: File[] = [];
	for await (const handle of directory.values())
		if (handle.kind === "file" && handle.name.endsWith(".webm"))
			files.push(await (handle as FileSystemFileHandle).getFile());
	files.sort((a, b) => a.name.localeCompare(b.name));
	return new File(files, `${entry.name}.webm`, { type: entry.mime });
}
export async function removeSpool(id: string) {
	if (window.opencutDesktop) return window.opencutDesktop.recordingRemove(id);
	await (await root()).removeEntry(id, { recursive: true });
}
