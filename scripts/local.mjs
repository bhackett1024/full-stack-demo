import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  process.env.THREADLINE_NODE,
  process.execPath,
  "/opt/homebrew/opt/node@22/bin/node",
  "/opt/homebrew/bin/node",
  "/usr/local/bin/node",
].filter(Boolean);
const node = candidates.find((p) => {
  if (!existsSync(p)) return false;
  const probe = spawnSync(p, ["-p", "process.versions.node"], {
    encoding: "utf8",
  });
  return Number(probe.stdout?.trim().split(".")[0]) >= 22;
});
if (!node) {
  console.error(
    "Node.js 22.13+ is required for workerd/Wrangler. Install a current Node release, then run npm start.",
  );
  process.exit(1);
}
const env = {
  ...process.env,
  PATH: `${dirname(node)}:${process.env.PATH}`,
  WRANGLER_LOG_PATH: resolve(root, ".wrangler/logs"),
  WRANGLER_SEND_METRICS: "false",
};
for (const args of [
  ["node_modules/vite/bin/vite.js", "build"],
  [
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
  ],
]) {
  const result = spawnSync(node, args, { cwd: root, env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const children = [];
const start = (args) => {
  const child = spawn(node, args, { cwd: root, env, stdio: "inherit" });
  children.push(child);
  return child;
};
const worker = start([
  "node_modules/wrangler/bin/wrangler.js",
  "dev",
  "--ip",
  "127.0.0.1",
  "--port",
  "8791",
]);
if (process.argv.includes("--dev"))
  start([
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5179",
    "--strictPort",
  ]);
const shutdown = () => {
  for (const child of children) child.kill("SIGTERM");
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
worker.on("exit", (code) => {
  shutdown();
  process.exitCode = code ?? 0;
});
