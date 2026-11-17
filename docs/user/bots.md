# Bots

Bots are persistent Hermes assistants with their own conversations, memory and local
computers. Your coding projects and provider threads continue to work as before.

Choose **New bot** beside the sidebar's new-thread action, or search for **New bot** in
the command palette. Give the bot a name, role and instructions. With several connected
environments, choose where it should run. Bots appear in the sidebar; select one to chat.

Open the **Bot** tab on the right to see its computer, tasks, routines and memory. You
can also add a Bot tab from a coding thread's panel menu and choose which bot to view.
The computer connects only while its view is open. **Take control** pauses the bot's
computer tools while you sign in or use its apps; **Hand back** or closing the view
returns control. Tasks created by the bot appear in Tasks. Ask the bot to schedule a
recurring job, then pause or resume it under Routines.

Pending action requests appear in the conversation. Allow an action once or decline it;
answer a question through its options or by sending a message. A read-only connection
can view bots but cannot create one, send messages or take control of its computer.

Deleting a managed bot removes its conversation, memory, files and computer. Disconnecting
a linked Hermes agent removes its T3 + Bots conversation and uploads; its existing Hermes
home, memory and Discord connection remain available.

## Install on Linux

Keep the Linux package archive, its `.sha256` file and `install.sh` together. Run:

```sh
./install.sh
```

Open **T3 Code + Bots** from your applications menu, or run `t3code-bots`. The installer
includes T3, Bot HQ and Bot HQ's Node runtime. Both servers start automatically and listen
on localhost. Updates use the same installer and retain your conversations and bot homes.
The fork's automatic upstream updates are disabled. See the proposed
[compatible update feed](../operations/bot-updates.md) for retaining Bots through
T3's normal update controls.

Install Hermes and its local desktop prerequisites first, following
[the local Hermes setup](https://github.com/zznorthstar/bot-hq/blob/feat/local-hermes-desktops/docs/LOCAL_SETUP.md).
The installer checks your Linux library version against this build's requirements.
It asks for Linux administrator authentication to configure Electron's sandbox helper.

The app installs under `~/.local/opt/t3code-bots` with its own shortcut. Its T3 data,
Electron profile, bots and files live under `~/.t3-bots`, separate from other T3 installs.
Bot computers are local desktops running as your Linux user.

For building the installer, see [Build the bot desktop](../operations/build-bots-desktop.md).

## Run from source

The integration uses the local Bot HQ runtime alongside T3's server, with one T3
interface. It supports web and Linux desktop; the mobile app has no bot screens.

Build the [local Hermes version of Bot HQ](https://github.com/zznorthstar/bot-hq/tree/feat/local-hermes-desktops)
in a sibling `bot-hq` directory and follow its local desktop prerequisites. In this T3
checkout, run:

```sh
vp run dev:bots
```

The launcher starts both servers and stores their development data under this checkout's
`.t3` directory. Your installed T3 database and your standalone Bot HQ data are left alone.
Set `BOT_HQ_ROOT` if the runtime checkout is elsewhere. If its native SQLite dependency was
built with a different Node version, set `BOT_HQ_NODE` to that version's Node executable.

To connect an already-running local runtime instead, set `BOT_HQ_URL` on the T3 server to
its loopback HTTP origin. The runtime must have local email sign-in enabled and allow
`t3@localhost`. It is a trusted local service; don't expose its development sign-in to the
network. Remote T3 clients reach bots through their authenticated T3 connection.

## Files, photos and voice

Use the paperclip to attach files, drop files onto the composer, or paste an image. Attach
up to ten files per message, each up to 10 MB. Attached images and text are available to
the agent. Other files stay in its library. File chips in the transcript download the original.

Open the gear beside the bot name to edit its instructions, upload a PNG/JPEG/WebP avatar
or choose a voice. Avatars appear beside messages and in the sidebar. Messages from another
bot carry that bot’s name and photo.

Use the phone icon beside Send to talk using local Whisper recognition and Kokoro speech. Allow microphone
access, then speak naturally; speaking over the bot stops its playback and interrupts its
current turn. Use the phone icon again to end the call. Closing the conversation also
releases the microphone. Headphones help the microphone distinguish your voice from playback.
Use the separate microphone icon to dictate a prompt. Stop dictation to insert the text
into your draft; it is not sent automatically and no voice call starts.

Set **Your name** under **Settings → General → Bots**. This is one global preference
used by every bot, defaulting to `user`. Bot settings also include a **SOUL.md** editor.
Saving that editor changes only the selected bot’s file, keeps a private previous version
and checks for changes made elsewhere. Edited souls survive later profile edits. C4my’s
existing soul is loaded unchanged and is written only if you explicitly save an edit.

English speech models run on this PC; the Hermes language model keeps its existing provider.
Speech has no API fees. On a fresh install, use **Install local voice models** in bot settings
first (requires `uv`, internet access for the initial downloads and roughly 600 MB of storage).

## Connect an existing Hermes agent

The installed app can link the Hermes gateway already running on this PC. It shares the
agent’s persona, tools and memory. Discord keeps working; recent Discord conversation appears
in the bot’s chat and provides context for app replies. App chats use their own API conversation.
The agent can read team discussions from Discord and message other bots through its HQ tools.

To enable the authenticated loopback API and team tools, run the bundled setup command:

```sh
~/.local/opt/t3code-bots/current/bot-hq/node \
  ~/.local/opt/t3code-bots/current/bot-hq/server/box/link-primary.mjs
hermes gateway restart
```

The setup saves private backups beside Hermes’ `.env` and `config.yaml`, preserves its terminal
backend and Discord credentials, and adds the HQ MCP connection. Then choose **New bot →
Connect Hermes** (or the name of an already linked agent). A Docker-backed Hermes computer
stays inside its existing sandbox. Connected-app credentials continue to use Bot HQ configuration.
