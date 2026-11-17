import { BotHqBot, BotHqRow } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { botMessageAuthor } from "./botMessageAuthor";

const doug: BotHqBot = {
  id: "bot_doug",
  name: "Doug",
  label: "",
  description: "",
  instructions: "",
  avatarColor: "blue",
  avatarShape: "blob",
  lastPreview: null,
  unread: 0,
  generation: 1,
  model: null,
  provider: null,
};
const c4my: BotHqBot = { ...doug, id: "bot_c4my", name: "C4my" };
const decodeRow = Schema.decodeUnknownSync(BotHqRow);
const decode = (body: unknown) =>
  decodeRow({
    botId: doug.id,
    generation: 1,
    seq: 1,
    updatedSeq: 1,
    createdAt: 1,
    kind: "message",
    body,
  });

describe("bot chat attribution", () => {
  it("retains cross-agent identity across the wire and displays the sending bot", () => {
    const row = decode({
      type: "message",
      role: "user",
      text: "Here is my answer.",
      from: { kind: "bot", id: c4my.id, name: c4my.name },
    });
    expect(botMessageAuthor(row, doug, [doug, c4my])).toEqual({
      isUser: false,
      name: "C4my",
      bot: c4my,
    });
  });
  it("keeps human messages distinct from Discord imports and assistant replies", () => {
    expect(
      botMessageAuthor(decode({ type: "message", role: "user", text: "Hi" }), doug, []),
    ).toMatchObject({ isUser: true, name: "You" });
    expect(
      botMessageAuthor(
        decode({
          type: "message",
          role: "user",
          from: { kind: "discord", id: "channel", name: "Discord" },
        }),
        doug,
        [],
      ),
    ).toMatchObject({ isUser: false, name: "Discord" });
    expect(
      botMessageAuthor(decode({ type: "message", role: "assistant", text: "Hello" }), doug, []),
    ).toMatchObject({ isUser: false, bot: doug });
  });
});
