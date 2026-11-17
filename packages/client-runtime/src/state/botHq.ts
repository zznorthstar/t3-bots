import {
  BotHqLive,
  WS_METHODS,
  type BotHqBot,
  type BotHqEvent,
  type BotHqRow,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type { Atom } from "effect/reactivity";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export interface BotHqRealtime {
  readonly rows: ReadonlyMap<string, ReadonlyArray<BotHqRow>>;
  readonly generations: ReadonlyMap<string, number>;
  readonly bots: ReadonlyMap<string, BotHqBot>;
  readonly live: ReadonlyMap<string, typeof BotHqLive.Type>;
  readonly hello: BotHqEvent | null;
  readonly roster: number;
  readonly details: ReadonlyMap<string, number>;
}
export const emptyBotHqRealtime: BotHqRealtime = {
  rows: new Map(),
  generations: new Map(),
  bots: new Map(),
  live: new Map(),
  hello: null,
  roster: 0,
  details: new Map(),
};

export function mergeBotRows(
  base: ReadonlyArray<BotHqRow>,
  updates: ReadonlyArray<BotHqRow>,
  generation: number,
) {
  const rows = new Map<number, BotHqRow>();
  for (const row of [...base, ...updates]) {
    if (row.generation !== generation) continue;
    const previous = rows.get(row.seq);
    if (!previous || row.updatedSeq >= previous.updatedSeq) rows.set(row.seq, row);
  }
  return [...rows.values()].sort((a, b) => a.seq - b.seq).slice(-200);
}

const decodeLive = Schema.decodeUnknownOption(BotHqLive);

export function applyBotHqEvent(state: BotHqRealtime, event: BotHqEvent): BotHqRealtime {
  if (event.type === "hello")
    return { ...emptyBotHqRealtime, hello: event, roster: state.roster + 1 };
  if (event.type === "roster") return { ...state, roster: state.roster + 1 };
  if (event.bot) return { ...state, bots: new Map(state.bots).set(event.bot.id, event.bot) };
  if (event.type === "live") {
    const live = decodeLive(event.state);
    return Option.isSome(live)
      ? { ...state, live: new Map(state.live).set(live.value.botId, live.value) }
      : state;
  }
  if (event.botId && (event.type === "rows" || event.type === "cleared")) {
    const generation = Math.max(state.generations.get(event.botId) ?? 0, event.generation ?? 0);
    return {
      ...state,
      generations: new Map(state.generations).set(event.botId, generation),
      rows: new Map(state.rows).set(
        event.botId,
        mergeBotRows(state.rows.get(event.botId) ?? [], event.rows ?? [], generation),
      ),
    };
  }
  if (event.botId && ["tasks", "routines", "memories"].includes(event.type)) {
    return {
      ...state,
      details: new Map(state.details).set(event.botId, (state.details.get(event.botId) ?? 0) + 1),
    };
  }
  return state;
}

export function createBotHqAtoms<R, E>(runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>) {
  const read = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "bot-hq:read",
    tag: WS_METHODS.botHqRead,
    staleTimeMs: 10_000,
    idleTtlMs: 60_000,
  });
  return {
    read,
    events: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "bot-hq:events",
      tag: WS_METHODS.botHqEvents,
      idleTtlMs: 0,
      transform: (stream) => stream.pipe(Stream.scan(() => emptyBotHqRealtime, applyBotHqEvent)),
    }),
    mutate: createEnvironmentRpcCommand(runtime, {
      label: "bot-hq:mutate",
      tag: WS_METHODS.botHqMutate,
      onSuccess: ({ environmentId, input }, registry) =>
        Effect.sync(() => {
          if (input._tag?.startsWith("voice-")) {
            if (input._tag === "voice-setup" || input._tag === "voice-warm")
              registry.refresh(read({ environmentId, input: { resource: "voice" } }));
            return;
          }
          if (input._tag === "upload") return;
          registry.refresh(read({ environmentId, input: { resource: "bots" } }));
          if ("botId" in input)
            registry.refresh(
              read({ environmentId, input: { resource: "rows", botId: input.botId } }),
            );
          if (input._tag === "avatar")
            registry.refresh(
              read({ environmentId, input: { resource: "avatar", botId: input.botId } }),
            );
        }),
    }),
  };
}
