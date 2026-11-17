import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { scanGlibcNeeds } from "./linux-glibc.ts";
import { BRAND_ASSET_PATHS } from "./lib/brand-assets.ts";

const root = NodeURL.fileURLToPath(new URL("..", import.meta.url));
// oxlint-disable-next-line t3code/no-global-process-runtime -- This standalone packager checks the native target before starting the Effect build command.
if (NodeOS.platform() !== "linux" || NodeOS.arch() !== "x64")
  throw new Error("The local Bot HQ desktop package currently targets Linux x64.");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const version = option("--version", "0.1.10-preview.bots.4");
if (!/^[\d.]+-[\w.]+$/.test(version)) throw new Error("Use a prerelease version for this fork.");
const output = NodePath.resolve(option("--output-dir", NodePath.join(root, "release/bots")));
const botRoot = NodePath.resolve(process.env.BOT_HQ_ROOT ?? NodePath.join(root, "../bot-hq"));
const botNode = process.env.BOT_HQ_NODE;
if (!botNode)
  throw new Error("Set BOT_HQ_NODE to a Node 22 executable for the bundled Bot HQ runtime.");
const run = async (command, commandArgs, options = {}) => {
  const child = NodeChildProcess.spawn(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`)),
    );
  });
};
const nodeVersion = NodeChildProcess.execFileSync(botNode, ["--version"], {
  encoding: "utf8",
}).trim();
if (!nodeVersion.startsWith("v22.")) throw new Error("BOT_HQ_NODE must be Node 22.");
await NodeFSP.mkdir(output, { recursive: true });
const base = NodePath.join(root, ".t3/bots-package-base");
const glibcCeiling = NodeChildProcess.execFileSync("getconf", ["GNU_LIBC_VERSION"], {
  encoding: "utf8",
})
  .trim()
  .split(" ")
  .at(-1);
if (!args.includes("--skip-base")) {
  await run(
    process.execPath,
    [
      "scripts/build-desktop-artifact.ts",
      "--platform",
      "linux",
      "--target",
      "dir",
      "--build-version",
      version,
      "--output-dir",
      base,
      ...(args.includes("--skip-build") ? ["--skip-build"] : []),
    ],
    { env: { ...process.env, T3CODE_DESKTOP_GLIBC_CEILING: glibcCeiling } },
  );
}
await NodeFSP.access(NodePath.join(base, "linux-unpacked/t3code"));
const stage = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-bots-package-"));
try {
  const app = NodePath.join(stage, "app");
  await NodeFSP.cp(NodePath.join(base, "linux-unpacked"), app, { recursive: true });
  const runtime = NodePath.join(app, "bot-hq");
  await NodeFSP.mkdir(NodePath.join(runtime, "server"), { recursive: true });
  await NodeFSP.mkdir(NodePath.join(runtime, "web"), { recursive: true });
  await run(
    botNode,
    [
      NodePath.join(botRoot, "node_modules/typescript/bin/tsc"),
      "-p",
      NodePath.join(botRoot, "server/tsconfig.json"),
    ],
    { cwd: botRoot },
  );
  for (const file of [
    "package.json",
    "package-lock.json",
    "server/package.json",
    "web/package.json",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "README.md",
  ]) {
    await NodeFSP.copyFile(NodePath.join(botRoot, file), NodePath.join(runtime, file));
  }
  await NodeFSP.cp(NodePath.join(botRoot, "server/dist"), NodePath.join(runtime, "server/dist"), {
    recursive: true,
  });
  await NodeFSP.cp(NodePath.join(botRoot, "server/box"), NodePath.join(runtime, "server/box"), {
    recursive: true,
  });
  await NodeFSP.copyFile(botNode, NodePath.join(runtime, "node"));
  await NodeFSP.chmod(NodePath.join(runtime, "node"), 0o755);
  await NodeFSP.copyFile(
    NodePath.resolve(botNode, "../../LICENSE"),
    NodePath.join(runtime, "NODE-LICENSE"),
  );
  const npm = NodePath.resolve(botNode, "../../lib/node_modules/npm/bin/npm-cli.js");
  await run(botNode, [npm, "ci", "--omit=dev", "--workspace=server", "--no-audit", "--no-fund"], {
    cwd: runtime,
    env: { ...process.env, PATH: `${NodePath.dirname(botNode)}:${process.env.PATH}` },
  });
  await run(
    NodePath.join(runtime, "node"),
    [
      "--input-type=module",
      "-e",
      "import Database from 'better-sqlite3'; const db = new Database(':memory:'); db.prepare('SELECT 1').get(); db.close();",
    ],
    { cwd: runtime },
  );
  await NodeFSP.copyFile(
    NodePath.join(root, "scripts/bot-desktop-launcher.mjs"),
    NodePath.join(runtime, "launcher.mjs"),
  );
  await NodeFSP.copyFile(
    NodePath.join(root, "scripts/install-bot-desktop.mjs"),
    NodePath.join(runtime, "install.mjs"),
  );
  await NodeFSP.copyFile(
    NodePath.join(root, BRAND_ASSET_PATHS.productionLinuxIconPng),
    NodePath.join(app, "icon.png"),
  );
  const botCommit = NodeChildProcess.execFileSync("git", ["-C", botRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const t3Commit = NodeChildProcess.execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const compatibility = await scanGlibcNeeds(app, glibcCeiling);
  await NodeFSP.writeFile(
    NodePath.join(runtime, "build.json"),
    JSON.stringify(
      { version, nodeVersion, t3Commit, botCommit, minimumGlibc: compatibility.minimum },
      null,
      2,
    ),
  );
  await NodeFSP.writeFile(
    NodePath.join(app, "t3code-bots"),
    '#!/bin/sh\nset -eu\napp_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$app_dir/bot-hq/node" "$app_dir/bot-hq/launcher.mjs" "$@"\n',
    { mode: 0o755 },
  );
  const archive = `t3code-bots-${version}-linux-x64.tar.gz`;
  await run("tar", ["-czf", NodePath.join(output, archive), "-C", stage, "app"]);
  const digest = NodeCrypto.createHash("sha256");
  const handle = await NodeFSP.open(NodePath.join(output, archive));
  for await (const chunk of handle.createReadStream()) digest.update(chunk);
  await NodeFSP.writeFile(
    NodePath.join(output, archive + ".sha256"),
    `${digest.digest("hex")}  ${archive}\n`,
  );
  const installer = `#!/bin/sh
set -eu
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$source_dir"
sha256sum -c '${archive}.sha256'
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT HUP INT TERM
tar -xzf '${archive}' -C "$stage"
"$stage/app/bot-hq/node" "$stage/app/bot-hq/install.mjs" "$stage/app" "$@"
`;
  await NodeFSP.writeFile(NodePath.join(output, "install.sh"), installer, { mode: 0o755 });
  process.stdout.write(`Installer ready: ${NodePath.join(output, "install.sh")}\n`);
} finally {
  await NodeFSP.rm(stage, { recursive: true, force: true });
}
