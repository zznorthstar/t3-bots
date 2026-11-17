import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const source = process.argv[2];
if (!source) throw new Error("Run the install.sh next to the package archive.");
const build = JSON.parse(
  await NodeFSP.readFile(NodePath.join(source, "bot-hq/build.json"), "utf8"),
);
if (!/^[\w.-]+$/.test(build.version)) throw new Error("Invalid package version");
const glibc = process.report.getReport().header.glibcVersionRuntime;
const parts = (value) => value.split(".").map(Number);
const [major, minor] = parts(glibc ?? "0.0");
const [neededMajor, neededMinor] = parts(build.minimumGlibc);
if (major < neededMajor || (major === neededMajor && minor < neededMinor))
  throw new Error(
    `This build requires glibc ${build.minimumGlibc} or newer; this PC has ${glibc ?? "no glibc"}.`,
  );
const base = NodePath.join(NodeOS.homedir(), ".local/opt/t3code-bots");
await NodeFSP.mkdir(NodePath.join(base, "releases"), { recursive: true });
const destination = NodePath.join(base, "releases", `${build.version}-${Date.now()}`);
await NodeFSP.cp(source, destination, { recursive: true });
const sandbox = NodePath.join(destination, "chrome-sandbox");
const sandboxSource = NodePath.join(destination, ".chrome-sandbox-install");
await NodeFSP.copyFile(sandbox, sandboxSource);
process.stdout.write(
  "Linux will ask for administrator authentication to configure Electron’s sandbox helper.\n",
);
try {
  await new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(
      "pkexec",
      ["/usr/bin/install", "-o", "root", "-g", "root", "-m", "4755", sandboxSource, sandbox],
      { stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Electron sandbox setup did not complete. Run the installer again.")),
    );
  });
} finally {
  await NodeFSP.unlink(sandboxSource);
}
await NodeFSP.symlink(destination, NodePath.join(base, `current-${process.pid}`));
await NodeFSP.rename(NodePath.join(base, `current-${process.pid}`), NodePath.join(base, "current"));
const bin = NodePath.join(NodeOS.homedir(), ".local/bin");
await NodeFSP.mkdir(bin, { recursive: true });
const launcher = NodePath.join(bin, "t3code-bots");
const executable = NodePath.join(base, "current/t3code-bots");
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
await NodeFSP.writeFile(launcher, `#!/bin/sh\nexec ${quote(executable)} "$@"\n`, { mode: 0o755 });
const applications = NodePath.join(
  process.env.XDG_DATA_HOME ?? NodePath.join(NodeOS.homedir(), ".local/share"),
  "applications",
);
await NodeFSP.mkdir(applications, { recursive: true });
const desktopValue = (value) =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("`", "\\`")
    .replaceAll("$", "\\$");
await NodeFSP.writeFile(
  NodePath.join(applications, "com.zznorthstar.T3CodeBots.desktop"),
  `[Desktop Entry]
Type=Application
Name=T3 Code + Bots
Comment=T3 Code with persistent local Hermes assistants
Exec="${desktopValue(launcher)}" %U
Icon=${NodePath.join(destination, "icon.png")}
Terminal=false
Categories=Development;
StartupWMClass=com.zznorthstar.T3CodeBots
`,
);
NodeChildProcess.spawnSync("update-desktop-database", [applications], { stdio: "ignore" });
process.stdout.write(`Installed T3 Code + Bots at ${destination}\nStart it with: ${launcher}\n`);
if (process.argv.includes("--launch")) {
  const child = NodeChildProcess.spawn(launcher, [], { stdio: "inherit" });
  child.once("error", (error) => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
