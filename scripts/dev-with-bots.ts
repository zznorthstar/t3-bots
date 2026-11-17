// @effect-diagnostics nodeBuiltinImport:off -- This development launcher owns its two child processes.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const root = NodeURL.fileURLToPath(new URL("..", import.meta.url));
const runtimeRoot = process.env.BOT_HQ_ROOT ?? NodePath.resolve(root, "../bot-hq");
const entry = NodePath.join(runtimeRoot, "server/dist/index.js");
await NodeFSP.access(entry).catch(() => {
  throw new Error(`Build the Bot HQ runtime first: cd ${runtimeRoot} && npm ci && npm run build`);
});
const home = NodePath.join(root, ".t3");
const state = NodePath.join(home, "bot-hq");
await NodeFSP.mkdir(state, { recursive: true, mode: 0o700 });
const secretFile = NodePath.join(state, "session-secret");
await NodeFSP.writeFile(secretFile, NodeCrypto.randomBytes(32).toString("hex"), {
  flag: "wx",
  mode: 0o600,
}).catch((error: NodeJS.ErrnoException) => {
  if (error.code !== "EEXIST") throw error;
});
const sessionSecret = (await NodeFSP.readFile(secretFile, "utf8")).trim();
const runtime = NodeChildProcess.spawn(process.env.BOT_HQ_NODE ?? process.execPath, [entry], {
  cwd: runtimeRoot,
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: "0",
    COMPUTER_BACKEND: "hermes",
    USE_PRIMARY_ENGINE: "0",
    ENGINE_PORT_BASE: process.env.BOT_HQ_ENGINE_PORT_BASE ?? "18650",
    DEV_LOGIN: "1",
    ALLOWED_EMAILS: "t3@localhost",
    SESSION_SECRET: sessionSecret,
    DB_PATH: NodePath.join(state, "bots.db"),
    ENGINES_DIR: NodePath.join(state, "engines"),
    LIBRARY_ROOT: NodePath.join(state, "files"),
  },
  stdio: ["ignore", "pipe", "inherit"],
});
let t3: ReturnType<typeof NodeChildProcess.spawn> | undefined;
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  t3?.kill("SIGTERM");
  runtime.kill("SIGTERM");
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
runtime.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  stop();
  process.exitCode = 1;
});
runtime.on("exit", () => {
  if (!stopping) {
    stop();
    process.exitCode = 1;
  }
});
let output = "";
runtime.stdout.on("data", (chunk: Buffer) => {
  process.stdout.write(chunk);
  output = (output + chunk.toString()).slice(-4000);
  const address = output.match(/server on (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
  if (t3 || !address) return;
  t3 = NodeChildProcess.spawn(
    process.execPath,
    ["scripts/dev-runner.ts", "dev", ...process.argv.slice(2)],
    {
      cwd: root,
      env: { ...process.env, BOT_HQ_URL: address, T3CODE_HOME: home },
      stdio: "inherit",
    },
  );
  t3.on("error", (error) => {
    process.stderr.write(`${error.message}\n`);
    stop();
    process.exitCode = 1;
  });
  t3.on("exit", (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
});
