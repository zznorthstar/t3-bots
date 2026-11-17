# Updating T3 without losing Bots

Use T3's existing updater with a release feed for the combined T3 + Bots build.
Installing a stock T3 release replaces the modified application bundle, including
the bot routes, sidebar controls and RPC adapter. Keeping Bot HQ's data outside
the application preserves conversations, but does not preserve those UI features.

## Recommended release path

1. Detect a new upstream T3 release and merge it into an integration branch. Stop
   on conflicts; keep the last compatible release available.
2. Run T3's changed-file checks and bot integration tests. Verify normal
   coding threads, permissions, bot chat, dictation, calls, both desktop transports
   and preservation of Hermes homes and custom souls.
3. Build the complete combined application as a Linux `.deb` with its own package
   identity, or an AppImage. Bundle Bot HQ and its Node runtime in that artifact.
   T3's current updater supports those formats; our per-user directory/archive
   installer is not an updater-compatible format.
4. Publish the compatible artifact and updater manifests to the fork's GitHub
   Releases. Build with `T3CODE_DESKTOP_UPDATE_REPOSITORY=zznorthstar/t3-bots` and
   enable updates only once that feed serves verified combined builds. The user
   can then use T3's usual check, download and restart controls.

The packager already accepts a fork repository in `resolveGitHubPublishConfig`.
`DesktopUpdates` detects `.deb` installs through `resources/package-type`; unpacked
directory installs are excluded. Preserve those checks rather than bypassing them.
A `.deb` also provides a normal installation path for Electron's sandbox helper
on this PC, where the current installer needs administrator authentication for it.

## Runtime changes needed before enabling the feed

Move ownership of the Bot HQ sidecar into native application startup/shutdown, or
ensure the updater relaunches the existing combined launcher. An updater can start
the Electron executable directly; the current external launcher owns Bot HQ and
stops it when Electron exits. A new binary must start the matching runtime itself.
Verify this with an actual version-A to version-B update, not just a downloaded
artifact. Bot HQ must use the stable loopback port and the existing `~/.t3-bots`
data, while personal Hermes remains in its existing home.

Give the combined `.deb` its own package name and desktop identity so installing
or updating it cannot replace the separate stock T3 installation. Build on the
oldest supported Linux distribution and test native dependencies there. The current
locally built archive requires glibc 2.42 and is not a portable release baseline.

Keep database migrations compatible with the previous release where possible and
retain a recoverable backup before migrations that cannot be reversed. Verify that
usernames, avatars, attachments, voice models and edited SOUL.md files survive.
Never regenerate the linked agent's existing soul during an update.

## Longer-term option

An upstream-supported UI extension interface would allow the bot integration to
ship independently while stock T3 updates itself. The integration currently adds
source-level routes, components and RPC methods, so it cannot use that model yet.

This document is a proposed release design. It does not enable automatic updates,
publish releases or create a running synchronization workflow.
