# Build the bot desktop on Linux

The bot desktop uses T3's normal desktop packager, then adds the Bot HQ runtime from
the sibling checkout. It currently builds for Linux x64. Install T3's
[Linux build prerequisites](development.md#linux-appimage-prerequisites) and Rust first.

Use Node 26 for T3's build and set `BOT_HQ_NODE` to a Node 22 executable. That executable
is bundled with Bot HQ, whose native SQLite dependency is installed with the same ABI.
The Bot HQ checkout must be on `feat/local-hermes-desktops`; set `BOT_HQ_ROOT` if it is
not next to T3. No `.env`, credentials, bot homes or databases are copied into the package.

```sh
BOT_HQ_NODE=/path/to/node22 vp run dist:desktop:bots:linux
```

Artifacts appear under `release/bots`: an archive, SHA-256 checksum and `install.sh`.
Keep them together. `./install.sh --launch` installs per user and starts the app.

The build retains T3's default Linux release ceiling for ordinary releases. This local
bot build explicitly targets the build host's glibc and records the highest requirement
across the complete payload, including Bot HQ's native dependencies. The installer
rejects older hosts. Build on an older supported Linux distribution for wider compatibility.

`--skip-build` reuses T3's compiled bundles. `--skip-base` reuses the already packaged
`.t3/bots-package-base/linux-unpacked` directory when changing only the Bot HQ payload or
launcher. Neither option is appropriate after changing the source it skips.

Hermes, TigerVNC/Xfce and the computer-use driver remain host prerequisites. Installing
the package does not change a personal Hermes configuration or use cloud computers.
