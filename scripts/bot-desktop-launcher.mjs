import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeEvents from "node:events";

const runtimeRoot = NodeURL.fileURLToPath(new URL(".", import.meta.url));
const appRoot = NodePath.dirname(runtimeRoot);
const home = process.env.T3CODE_BOTS_HOME ?? NodePath.join(NodeOS.homedir(), ".t3-bots");
const state = NodePath.join(home, "bot-hq");
await NodeFSP.mkdir(state, { recursive: true, mode: 0o700 });
const secretFile = NodePath.join(state, "session-secret");
await NodeFSP.writeFile(secretFile, NodeCrypto.randomBytes(32).toString("hex"), {
  flag: "wx",
  mode: 0o600,
}).catch((error) => {
  if (error.code !== "EEXIST") throw error;
});
const sessionSecret = (await NodeFSP.readFile(secretFile, "utf8")).trim();
const lockFile = NodePath.join(state, "launcher.json");
let runtime;
let runtimeExit;
let desktop;
let ownsRuntime = false;
let closing = false;
const children = new Set();
function stop() {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", () => {
  for (const child of children) child.kill("SIGTERM");
});
const childExit = (child) => {
  children.add(child);
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      children.delete(child);
      resolve(code ?? 1);
    });
  });
};
const alive = (pid) => {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const portFile = NodePath.join(state, "runtime-port");
let port;
try {
  const existing = JSON.parse(await NodeFSP.readFile(lockFile, "utf8"));
  if (alive(existing.pid)) port = existing.port;
  else await NodeFSP.unlink(lockFile);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
let lock;
if (port === undefined) {
  lock = await NodeFSP.open(lockFile, "wx", 0o600);
  ownsRuntime = true;
  const saved = Number(await NodeFSP.readFile(portFile, "utf8").catch(() => "0"));
  await lock.writeFile(JSON.stringify({ pid: process.pid, port: saved || 18787 }));
  await lock.close();
  const server = NodeNet.createServer();
  server.listen(saved || 18787, "127.0.0.1");
  await NodeEvents.once(server, "listening");
  port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await NodeFSP.writeFile(portFile, String(port), { mode: 0o600 });
  await NodeFSP.writeFile(lockFile, JSON.stringify({ pid: process.pid, port }), { mode: 0o600 });
}
const origin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  PATH: [NodePath.join(NodeOS.homedir(), ".local/bin"), process.env.PATH].filter(Boolean).join(":"),
  T3CODE_HOME: home,
  T3CODE_DESKTOP_USER_DATA_DIR: NodePath.join(home, "electron"),
  T3CODE_BOT_DESKTOP: "1",
  T3CODE_DISABLE_AUTO_UPDATE: "1",
  T3CODE_DESKTOP_APP_USER_MODEL_ID: "com.zznorthstar.T3CodeBots",
  BOT_HQ_URL: origin,
};
delete env.VITE_DEV_SERVER_URL;
delete env.T3CODE_PORT;
delete env.T3CODE_DESKTOP_LAUNCHER_PATH;
try {
  if (ownsRuntime) {
    const log = await NodeFSP.open(NodePath.join(state, "runtime.log"), "a", 0o600);
    runtime = NodeChildProcess.spawn(
      process.execPath,
      [NodePath.join(runtimeRoot, "server/dist/index.js")],
      {
        cwd: runtimeRoot,
        env: {
          ...env,
          HOST: "127.0.0.1",
          PORT: String(port),
          MCP_BASE_URL: origin,
          SERVER_URL: origin,
          COMPUTER_BACKEND: "hermes",
          USE_PRIMARY_ENGINE: "0",
          ENGINE_PORT_BASE: "28650",
          DEV_LOGIN: "1",
          ALLOWED_EMAILS: "t3@localhost",
          SESSION_SECRET: sessionSecret,
          DB_PATH: NodePath.join(state, "bots.db"),
          ENGINES_DIR: NodePath.join(state, "engines"),
          LIBRARY_ROOT: NodePath.join(state, "files"),
        },
        stdio: ["ignore", log.fd, log.fd],
      },
    );
    const exit = childExit(runtime);
    runtimeExit = exit;
    const ready = new Promise((resolve, reject) => {
      let completed = false;
      const deadline = setTimeout(
        () => finish(new Error("Bot HQ did not become ready. See " + state + "/runtime.log")),
        30_000,
      );
      let timer;
      const finish = (error) => {
        if (completed) return;
        completed = true;
        clearTimeout(deadline);
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      const probe = async () => {
        try {
          const response = await fetch(origin + "/api/health", {
            signal: AbortSignal.timeout(1000),
          });
          if (response.ok) return finish();
        } catch {}
        if (!completed) timer = setTimeout(probe, 150);
      };
      void probe();
      void exit.then(() => finish(new Error("The bot runtime stopped during startup.")), finish);
    });
    await ready;
    await log.close();
    void exit.then(() => {
      if (!closing) {
        process.stderr.write("The bot runtime stopped. Relaunch T3 Code + Bots to reconnect.\n");
        stop();
      }
    });
  }
  desktop = NodeChildProcess.spawn(
    NodePath.join(appRoot, "t3code"),
    ["--class=com.zznorthstar.T3CodeBots", ...process.argv.slice(2)],
    {
      cwd: NodeOS.homedir(),
      env,
      stdio: "inherit",
    },
  );
  process.exitCode = await childExit(desktop);
} finally {
  stop();
  if (runtimeExit) {
    const force = setTimeout(() => runtime.kill("SIGKILL"), 5000);
    await runtimeExit.catch(() => {});
    clearTimeout(force);
  }
  if (ownsRuntime) await NodeFSP.unlink(lockFile).catch(() => {});
}
