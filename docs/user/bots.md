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

Deleting a bot removes its conversation, memory, files and managed computer. It does not
delete your T3 projects or coding threads.

## Run this fork with bots

This first integration uses the local Bot HQ runtime alongside T3's server, with one
T3 interface. It currently supports web and desktop; the mobile app has no bot screens.

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

Voice and connected-app configuration are still managed by the Bot HQ runtime and are
not yet exposed in T3's bot panel. Live desktop use requires the Hermes desktop packages.
