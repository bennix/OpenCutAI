import { fileURLToPath } from "node:url";

// Bun module mocks are process-global. Give each suite a clean module registry.
const root = fileURLToPath(new URL("../", import.meta.url));
const tests = [
  ...Array.from(new Bun.Glob("apps/web/src/ai/__tests__/*.test.ts").scanSync({ cwd: root })).sort(),
  "scripts/mcp.test.ts",
];
for (const file of tests) {
  const child = Bun.spawn([process.execPath, "test", file], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await child.exited !== 0) process.exit(1);
}
