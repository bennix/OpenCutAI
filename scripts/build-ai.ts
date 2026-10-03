import { unlink } from "node:fs/promises";
const build = Bun.spawn(
	[
		"bun",
		"x",
		"wasm-pack@0.15.0",
		"build",
		"rust/crates/ai",
		"--target",
		"bundler",
		"--out-dir",
		"../../../packages/ai",
		"--out-name",
		"index",
	],
	{ stdout: "inherit", stderr: "inherit" },
);
if ((await build.exited) !== 0) throw new Error("AI WASM build failed");
// wasm-pack ignores generated files by default; ship the browser artifact here.
await unlink("packages/ai/.gitignore").catch(() => {});
