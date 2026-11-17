// @effect-diagnostics nodeBuiltinImport:off -- These subprocess fixtures exercise the shipped Node launcher outside Electron.
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodeNet from "node:net";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

describe("bundled bot launcher", () => {
  it.each([false, true])(
    "owns its runtime and isolates Electron data (startup failure: %s)",
    async (fails) => {
      const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-bot-launcher-test-"));
      const runtime = NodePath.join(root, "app/bot-hq");
      const home = NodePath.join(root, "data");
      let child: NodeChildProcess.ChildProcess | undefined;
      try {
        await NodeFSP.mkdir(NodePath.join(runtime, "server/dist"), { recursive: true });
        await NodeFSP.copyFile(
          new URL("./bot-desktop-launcher.mjs", import.meta.url),
          NodePath.join(runtime, "launcher.mjs"),
        );
        await NodeFSP.writeFile(
          NodePath.join(runtime, "server/dist/index.js"),
          fails
            ? "process.exit(7)"
            : `
        const http = require('node:http');
        const fs = require('node:fs');
        fs.writeFileSync(process.env.T3CODE_HOME+'/runtime.json', JSON.stringify({port:process.env.PORT,mcp:process.env.MCP_BASE_URL}));
        http.createServer((_,res)=>{res.setHeader('Content-Type','application/json');res.end('{"ok":true}');}).listen(Number(process.env.PORT),'127.0.0.1');
      `,
        );
        await NodeFSP.writeFile(
          NodePath.join(root, "app/t3code"),
          `#!${process.execPath}
        require('node:fs').writeFileSync(process.env.T3CODE_HOME+'/desktop.json', JSON.stringify({home:process.env.T3CODE_HOME,userData:process.env.T3CODE_DESKTOP_USER_DATA_DIR,bots:process.env.BOT_HQ_URL,updates:process.env.T3CODE_DISABLE_AUTO_UPDATE}));
      `,
          { mode: 0o755 },
        );
        await NodeFSP.mkdir(NodePath.join(home, "bot-hq"), { recursive: true });
        const reservation = NodeNet.createServer();
        await new Promise<void>((resolve, reject) => {
          reservation.once("error", reject);
          reservation.listen(0, "127.0.0.1", resolve);
        });
        const address = reservation.address();
        if (!address || typeof address === "string") throw new Error("Expected a loopback port");
        await new Promise<void>((resolve, reject) =>
          reservation.close((error) => (error ? reject(error) : resolve())),
        );
        await NodeFSP.writeFile(NodePath.join(home, "bot-hq/runtime-port"), String(address.port));
        child = NodeChildProcess.spawn(process.execPath, [NodePath.join(runtime, "launcher.mjs")], {
          env: { ...process.env, T3CODE_BOTS_HOME: home },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stderr = "";
        child.stderr?.on("data", (chunk) => {
          stderr += chunk;
        });
        const code = await new Promise<number | null>((resolve, reject) => {
          child!.once("error", reject);
          child!.once("exit", resolve);
        });
        expect(code, stderr).toBe(fails ? 1 : 0);
        expect(
          await NodeFSP.stat(NodePath.join(home, "bot-hq/launcher.json")).then(
            () => true,
            () => false,
          ),
        ).toBe(false);
        if (!fails) {
          const server = JSON.parse(
            await NodeFSP.readFile(NodePath.join(home, "runtime.json"), "utf8"),
          );
          const desktop = JSON.parse(
            await NodeFSP.readFile(NodePath.join(home, "desktop.json"), "utf8"),
          );
          expect(desktop).toEqual({
            home,
            userData: NodePath.join(home, "electron"),
            bots: `http://127.0.0.1:${server.port}`,
            updates: "1",
          });
          expect(server.mcp).toBe(desktop.bots);
        }
      } finally {
        child?.kill("SIGTERM");
        await NodeFSP.rm(root, { recursive: true, force: true });
      }
    },
  );
});
