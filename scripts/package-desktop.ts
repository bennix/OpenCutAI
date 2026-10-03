import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
async function run(command: string[], cwd = root) {
	const process = Bun.spawn(command, {
		cwd,
		stdout: "inherit",
		stderr: "inherit",
	});
	if ((await process.exited) !== 0)
		throw new Error(`命令失败：${command.join(" ")}`);
}
if (!process.argv.includes("--skip-web-build"))
	await run(["bun", "run", "build"], resolve(root, "apps/web"));
const destination = resolve(root, "apps/web/.next/standalone/apps/web");
await mkdir(resolve(destination, ".next"), { recursive: true });
await cp(
	resolve(root, "apps/web/.next/static"),
	resolve(destination, ".next/static"),
	{ recursive: true },
);
await cp(resolve(root, "apps/web/public"), resolve(destination, "public"), {
	recursive: true,
});
const buildId = (
	await readFile(resolve(root, "apps/web/.next/BUILD_ID"), "utf8")
).trim();
await writeFile(
	resolve(root, "apps/electron/web-build.json"),
	JSON.stringify({ buildId }),
);
// Apple scans native binaries inside compressed resources too.
// Sign these before archiving the embedded server, not just the Electron shell.
async function signEmbeddedLibraries(directory: string) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory()) await signEmbeddedLibraries(file);
		else if (entry.isFile() && /\.(node|dylib)$/.test(entry.name)) {
			for (let attempt = 0; ; attempt++) {
				try {
					await run([
						"codesign",
						"--force",
						"--sign",
						process.env.CSC_NAME ??
							"Developer ID Application: ZHIPING XU (5N66S29EK2)",
						"--timestamp",
						"--options",
						"runtime",
						file,
					]);
					break;
				} catch (error) {
					if (attempt >= 2) throw error;
				}
			}
		}
	}
}
if (process.platform === "darwin") await signEmbeddedLibraries(resolve(root, "apps/web/.next/standalone"));
await run([
	process.platform === "win32" ? "tar.exe" : "/usr/bin/tar",
	"-czf",
	resolve(root, "apps/electron/web.tar.gz"),
	"-C",
	resolve(root, "apps/web/.next/standalone"),
	".",
]);
const platformArgs = process.platform === "win32" ? ["--win", "nsis", "--x64"] : process.platform === "linux" ? ["--linux", "deb", "rpm", "--x64"] : ["--mac", "--dir"];
await run(["bun", "x", "electron-builder", "--config", "apps/electron/builder.json", "--publish", "never", ...platformArgs]);
