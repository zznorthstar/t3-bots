import { useAtomValue } from "@effect/atom-react";
import { createBotHqAtoms, emptyBotHqRealtime } from "@t3tools/client-runtime/state/botHq";
import { resolveDeviceHubAccess } from "@t3tools/client-runtime/state/deviceHubAccess";
import type { BotHqReadInput, EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import { useEffect, useEffectEvent } from "react";
import { connectionAtomRuntime } from "../connection/runtime";
import { environmentSession } from "./session";
import { useEnvironmentQuery } from "./query";

export const botHq = createBotHqAtoms(connectionAtomRuntime);

export function useBotHq(environmentId: EnvironmentId) {
  const list = useEnvironmentQuery(botHq.read({ environmentId, input: { resource: "bots" } }));
  const events = useEnvironmentQuery(list.data ? botHq.events({ environmentId, input: {} }) : null);
  const realtime = events.data ?? emptyBotHqRealtime;
  const refresh = useEffectEvent(list.refresh);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- resync the roster after an upstream reconnect or bot lifecycle event
  useEffect(() => {
    if (realtime.roster > 0 || realtime.hello !== null) refresh();
  }, [realtime.roster, realtime.hello]);
  return {
    ...list,
    refresh: () => {
      list.refresh();
      events.refresh();
    },
    realtime,
    streamError: events.error,
    bots: (list.data?.bots ?? []).map((bot) => realtime.bots.get(bot.id) ?? bot),
  };
}

export function useBotHqRead(environmentId: EnvironmentId, input: BotHqReadInput, enabled = true) {
  const query = useEnvironmentQuery(enabled ? botHq.read({ environmentId, input }) : null);
  return query;
}

export const botHqScreenAccess = Atom.family((environmentId: EnvironmentId) =>
  connectionAtomRuntime.atom((get) => {
    const prepared = Option.getOrNull(
      get(environmentSession.preparedConnectionValueAtom(environmentId)),
    );
    return prepared === null
      ? Effect.never
      : resolveDeviceHubAccess({ prepared, hubBasePath: "/api/bot-hq/screen" });
  }),
);

export function useBotHqScreenAccess(environmentId: EnvironmentId) {
  return useAtomValue(botHqScreenAccess(environmentId));
}
