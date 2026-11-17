import type { BotHqRow } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { applyBotHqEvent, emptyBotHqRealtime, mergeBotRows } from "./botHq.ts";

const row = (seq: number, updatedSeq: number, generation = 1): BotHqRow => ({
  botId: "bot_one",
  seq,
  updatedSeq,
  generation,
  kind: "message",
  createdAt: 1,
  body: { type: "message", role: "assistant", text: `revision ${updatedSeq}` },
});

describe("bot transcripts", () => {
  it("keeps newer streaming revisions when the initial snapshot arrives late", () => {
    expect(mergeBotRows([row(1, 2)], [row(1, 4), row(1, 3), row(2, 5)], 1)).toEqual([
      row(1, 4),
      row(2, 5),
    ]);
  });
  it("drops the previous conversation and ignores delayed rows after a clear", () => {
    let state = applyBotHqEvent(emptyBotHqRealtime, {
      type: "rows",
      botId: "bot_one",
      generation: 1,
      rows: [row(1, 2)],
    });
    state = applyBotHqEvent(state, { type: "cleared", botId: "bot_one", generation: 2 });
    state = applyBotHqEvent(state, {
      type: "rows",
      botId: "bot_one",
      generation: 1,
      rows: [row(2, 3)],
    });
    expect(state.rows.get("bot_one")).toEqual([]);
    expect(
      mergeBotRows(
        [row(1, 2)],
        state.rows.get("bot_one") ?? [],
        state.generations.get("bot_one") ?? 0,
      ),
    ).toEqual([]);
  });
  it("bounds retained streaming rows and resets stale state on reconnect", () => {
    const state = applyBotHqEvent(emptyBotHqRealtime, {
      type: "rows",
      botId: "bot_one",
      generation: 1,
      rows: Array.from({ length: 250 }, (_, index) => row(index + 1, index + 1)),
    });
    expect(state.rows.get("bot_one")).toHaveLength(200);
    const reconnect = applyBotHqEvent(state, { type: "hello" });
    expect(reconnect.rows.size).toBe(0);
    expect(reconnect.hello).toEqual({ type: "hello" });
    const nextConnection = applyBotHqEvent(emptyBotHqRealtime, { type: "hello" });
    expect(nextConnection.hello).not.toBe(reconnect.hello);
  });
});
