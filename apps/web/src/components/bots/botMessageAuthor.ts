import type { BotHqBot, BotHqRow } from "@t3tools/contracts";

export function botMessageAuthor(row: BotHqRow, current: BotHqBot, bots: ReadonlyArray<BotHqBot>) {
  const from = row.body.from;
  if (row.body.role === "assistant") return { isUser: false, name: current.name, bot: current };
  if (from?.kind === "bot")
    return { isUser: false, name: from.name, bot: bots.find((bot) => bot.id === from.id) };
  if (from?.kind === "routine") return { isUser: false, name: from.name, bot: current };
  if (from?.kind === "telegram") return { isUser: false, name: "Telegram", bot: undefined };
  if (from?.kind === "discord") return { isUser: false, name: "Discord", bot: undefined };
  return { isUser: true, name: from?.kind === "voice" ? "You · voice" : "You", bot: undefined };
}
