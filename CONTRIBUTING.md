# Contributing to T3 + Bots

This repository is an independent T3 fork with Bot HQ integrated into the interface. Send integration issues and pull requests here, not to the T3 or Bot HQ maintainers.

Small fixes, reproducible bug reports and focused improvements are welcome. There is no support SLA or promise of review. Discuss larger changes in an issue before investing in them. Keeping the normal T3 workflow familiar matters more than growing a feature list.

## Before opening an issue

Search existing issues, check [known limits](README.md#before-you-make-it-your-daily-driver), and include your OS, app commit/version, Hermes version and reproduction steps. Say whether the problem happens in a coding thread, bot chat, voice or a bot computer. Redact credentials, pairing links, private messages and personal file paths from logs and screenshots.

## Working on the app

Follow [the source setup](README.md#run-from-source) and [AGENTS.md](AGENTS.md). Before pushing a code change, run:

```sh
vp run check:changed
```

Use focused tests for the behavior you change. The runtime is pinned at `runtime/bot-hq`. Publish runtime changes in its repository before updating the submodule pointer here, so other people can reproduce your checkout. Use Node 22 for its SQLite dependency.

```sh
cd runtime/bot-hq
npm run build -w server
npm run typecheck -w server
node --test tests/chat-features.test.mjs tests/local-desktop.test.mjs
python3 tests/migrate-telegram-profile.test.py
```

Never develop against another person's live T3 or Hermes database. Use isolated test data. Do not send real Discord or Telegram messages, make paid model calls, or publish private logs as part of automated tests.

## Pull requests

Explain one problem, the resulting behavior and verification. Include visual evidence for UI changes, using fictional or redacted data. Preserve upstream attribution and licenses. Contributions are available under this project's MIT license.

For work intended for official T3, follow [T3's own contribution policy](CONTRIBUTING.upstream.md). This fork's bot experiment is not an upstream feature proposal.
