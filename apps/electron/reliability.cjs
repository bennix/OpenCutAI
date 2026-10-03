const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const allowedPath =
	/^\/api\/(v1\/(chat\/completions|images\/generations|models|videos(?:\/[\w-]+)?|interactions)|vertex-ai\/v1\/publishers\/[\w-]+\/models\/[\w.-]+:generateContent)$/;
const cdns = [
	"storage.googleapis.com",
	"marmot-cloud.com",
	"fal.media",
	"fal.ai",
	"cloudfront.net",
	"bfl.ai",
	"minimax.io",
	"hailuoai.com",
	"volcengineapi.com",
	"byteintlapi.com",
	"ufileos.com",
	"agnes-ai.space",
];
function publicMedia(value) {
	const u = new URL(value);
	if (
		u.protocol !== "https:" ||
		u.username ||
		u.password ||
		(u.port && u.port !== "443") ||
		!cdns.some((h) => u.hostname === h || u.hostname.endsWith("." + h))
	)
		throw new Error("Unsupported media CDN");
	return u;
}
function createReliability({ root, safeStorage }) {
	const directory = path.join(root, "recording-recovery"),
		keyFile = path.join(root, "zenmux-vault.bin");
	const requests = new Map();
	const queues = new Map();
	const valid = (id) => {
		if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
			throw new Error("Invalid recording ID");
		return id;
	};
	const file = (id) => path.join(directory, valid(id) + ".webm");
	const manifest = (id) => path.join(directory, valid(id) + ".json");
	async function metadata(id) {
		return JSON.parse(await fs.readFile(manifest(id), "utf8"));
	}
	function backend() {
		if (
			!safeStorage.isEncryptionAvailable() ||
			safeStorage.getSelectedStorageBackend?.() === "basic_text"
		)
			throw new Error(
				"System credential storage is unavailable. Configure a system keyring; plaintext fallback is disabled.",
			);
	}
	async function key(kind = "generation") {
		const target = kind === "management" ? keyFile + ".management" : keyFile;
		backend();
		try {
			return safeStorage.decryptString(await fs.readFile(target));
		} catch (e) {
			if (e.code === "ENOENT") return "";
			throw new Error("Unable to unlock system credential storage");
		}
	}
	return {
		async credentialStatus(kind) {
			const target = kind === "management" ? keyFile + ".management" : keyFile;
			let exists = false;
			try {
				await fs.access(target);
				exists = true;
			} catch {}
			return {
				saved: exists,
				available:
					safeStorage.isEncryptionAvailable() &&
					safeStorage.getSelectedStorageBackend?.() !== "basic_text",
				backend:
					process.platform === "darwin"
						? "macOS Keychain"
						: process.platform === "win32"
							? "Windows DPAPI"
							: (safeStorage.getSelectedStorageBackend?.() ?? "system keyring"),
			};
		},
		async saveCredential(input) {
			const value = typeof input === "string" ? input : input?.value;
			const target =
				input?.kind === "management" ? keyFile + ".management" : keyFile;
			if (typeof value !== "string" || value.length > 8192)
				throw new Error("Invalid credential");
			if (!value.trim()) {
				await fs.rm(target, { force: true });
				return;
			}
			backend();
			await fs.mkdir(root, { recursive: true });
			const temp = target + ".tmp";
			await fs.writeFile(temp, safeStorage.encryptString(value.trim()), {
				mode: 0o600,
			});
			await fs.rename(temp, target);
		},
		async request(input) {
			if (
				!input ||
				typeof input.id !== "string" ||
				input.id.length > 100 ||
				!allowedPath.test(input.path) ||
				JSON.stringify(input.body ?? {}).length > 32 * 1024 * 1024
			)
				throw new Error("Invalid AI request");
			if (requests.has(input.id)) throw new Error("Request already active");
			const controller = new AbortController();
			requests.set(input.id, controller);
			try {
				const secret = await key();
				if (!secret) throw new Error("Save your ZenMux API Key in Settings");
				controller.signal.throwIfAborted();
				const response = await fetch("https://zenmux.ai" + input.path, {
					method: input.body === undefined ? "GET" : "POST",
					headers: {
						Authorization: "Bearer " + secret,
						"Content-Type": "application/json",
					},
					body:
						input.body === undefined ? undefined : JSON.stringify(input.body),
					signal: AbortSignal.any([
						controller.signal,
						AbortSignal.timeout(600000),
					]),
				});
				const data = await response.json();
				return {
					status: response.status,
					data,
					retryAfter: response.headers.get("retry-after"),
				};
			} catch (e) {
				if (controller.signal.aborted)
					throw new Error(
						"Request cancelled; submitted provider jobs may still be billed",
					);
				throw new Error(
					e.name === "TimeoutError"
						? "ZenMux request timed out; submission result may be unknown"
						: "ZenMux connection failed; submission result may be unknown",
				);
			} finally {
				requests.delete(input.id);
			}
		},
		async management(input) {
			if (!input || !["balance", "cost"].includes(input.action))
				throw new Error("Invalid management request");
			const secret = await key("management");
			if (!secret)
				throw new Error(
					"Save a Management API Key; standard API Keys are not supported",
				);
			let endpoint = "/api/v1/management/payg/balance";
			if (input.action === "cost") {
				if (!/^\d{6}$/.test(input.month))
					throw new Error("Invalid billing month");
				const q = new URLSearchParams({
					type: "cost",
					query_dimension: "BIZ_MTH",
					query_time: input.month,
					bill_types: "metered,fallbackMetered",
				});
				if (input.apiKeyId) {
					if (!/^[\w,-]{1,500}$/.test(input.apiKeyId))
						throw new Error("Invalid API Key ID");
					q.set("api_key_ids", input.apiKeyId);
				}
				endpoint = "/api/v1/management/cost?" + q;
			}
			const response = await fetch("https://zenmux.ai" + endpoint, {
				headers: { Authorization: "Bearer " + secret },
				signal: AbortSignal.timeout(20000),
			});
			if (!response.ok)
				throw new Error("Management API HTTP " + response.status);
			return await response.json();
		},
		cancel(id) {
			requests.get(id)?.abort();
		},
		async media(input) {
			if (
				!input ||
				typeof input.id !== "string" ||
				input.id.length > 100 ||
				requests.has(input.id)
			)
				throw new Error("Invalid media request");
			let url = publicMedia(input.url);
			const controller = new AbortController();
			requests.set(input.id, controller);
			try {
				for (let i = 0; i < 5; i++) {
					const r = await fetch(url, {
						redirect: "manual",
						signal: AbortSignal.any([
							controller.signal,
							AbortSignal.timeout(120000),
						]),
					});
					if (r.status >= 300 && r.status < 400 && r.headers.has("location")) {
						url = publicMedia(new URL(r.headers.get("location"), url).href);
						continue;
					}
					if (!r.ok) throw new Error("Media download HTTP " + r.status);
					return {
						bytes: await r.arrayBuffer(),
						mime: r.headers.get("content-type") ?? "application/octet-stream",
					};
				}
				throw new Error("Too many media redirects");
			} finally {
				requests.delete(input.id);
			}
		},
		async begin(input) {
			if (
				!input ||
				typeof input.name !== "string" ||
				input.name.length > 100 ||
				!["video/webm", "audio/webm"].some((m) => input.mime?.startsWith(m))
			)
				throw new Error("Invalid recording");
			await fs.mkdir(directory, { recursive: true });
			const id = randomUUID();
			await fs.writeFile(file(id), "", { mode: 0o600 });
			await fs.writeFile(
				manifest(id),
				JSON.stringify({
					id,
					name: input.name,
					mime: input.mime,
					primary: input.primary === true,
					created: Date.now(),
					complete: false,
				}),
				{ mode: 0o600 },
			);
			return id;
		},
		async append(input) {
			valid(input.id);
			if (
				!(input.bytes instanceof ArrayBuffer) ||
				input.bytes.byteLength > 16 * 1024 * 1024
			)
				throw new Error("Invalid recording chunk");
			const previous = queues.get(input.id) ?? Promise.resolve();
			const next = previous.then(async () => {
				await metadata(input.id);
				const handle = await fs.open(file(input.id), "a");
				try {
					await handle.writeFile(Buffer.from(input.bytes));
					await handle.sync();
				} finally {
					await handle.close();
				}
			});
			queues.set(input.id, next);
			try {
				await next;
			} finally {
				if (queues.get(input.id) === next) queues.delete(input.id);
			}
		},
		async finish(id) {
			await queues.get(valid(id));
			const m = await metadata(id);
			m.complete = true;
			await fs.writeFile(manifest(id), JSON.stringify(m));
			return m;
		},
		async list() {
			await fs.mkdir(directory, { recursive: true });
			const result = [];
			for (const entry of await fs.readdir(directory)) {
				if (!entry.endsWith(".json")) continue;
				try {
					const m = await metadata(entry.slice(0, -5)),
						s = await fs.stat(file(m.id));
					result.push({ ...m, bytes: s.size });
				} catch {}
			}
			return result;
		},
		async read(id) {
			const m = await metadata(valid(id)),
				bytes = await fs.readFile(file(id));
			return {
				...m,
				bytes: bytes.buffer.slice(
					bytes.byteOffset,
					bytes.byteOffset + bytes.byteLength,
				),
			};
		},
		async remove(id) {
			valid(id);
			await queues.get(id);
			await fs.rm(file(id), { force: true });
			await fs.rm(manifest(id), { force: true });
		},
	};
}
module.exports = { createReliability, allowedPath, publicMedia };
