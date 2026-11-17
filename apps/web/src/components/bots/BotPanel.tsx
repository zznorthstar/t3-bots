import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useEffectEvent, useState } from "react";
import { botHq, useBotHq, useBotHqRead } from "~/state/botHq";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../ui/empty";
import { ScrollArea } from "../ui/scroll-area";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { BotComputer } from "./BotComputer";
import { botCommandError } from "./NewBotDialog";

const sections = ["Computer", "Tasks", "Routines", "Memory"] as const;

function BotDetails({
  environmentId,
  botId,
  section,
}: {
  environmentId: EnvironmentId;
  botId: string;
  section: "Tasks" | "Routines" | "Memory";
}) {
  const resource = section === "Memory" ? "memories" : section === "Tasks" ? "tasks" : "routines";
  const query = useBotHqRead(environmentId, { resource, botId });
  const state = useBotHq(environmentId);
  const revision = state.realtime.details.get(botId) ?? 0;
  const refresh = useEffectEvent(query.refresh);
  const mutate = useAtomCommand(botHq.mutate, { reportFailure: false });
  const allowed = useAtomValue(botHq.mutate.permissionAtom(environmentId));
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- detail lists follow runtime change events and reconnects without polling
  useEffect(() => {
    if (revision > 0 || state.realtime.hello !== null) refresh();
  }, [revision, state.realtime.hello]);
  if (!query.data)
    return (
      <BotEmpty
        title={
          query.error
            ? "Could not load " + section.toLowerCase()
            : "Loading " + section.toLowerCase() + "…"
        }
        description={query.error ?? "Getting the bot’s latest information."}
        onRetry={query.error ? query.refresh : undefined}
      />
    );
  const tasks = section === "Tasks" ? (query.data.tasks ?? []) : [];
  const routines = section === "Routines" ? (query.data.routines ?? []) : [];
  const memories = section === "Memory" ? (query.data.memories ?? []) : [];
  if (tasks.length + routines.length + memories.length === 0)
    return (
      <BotEmpty
        title={`No ${section.toLowerCase()} yet`}
        description={
          section === "Memory"
            ? "As you work together, the bot can remember your preferences and important context."
            : section === "Routines"
              ? "Ask the bot to schedule a recurring task in your conversation."
              : "Ask the bot to track a task in your conversation."
        }
      />
    );
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="divide-y">
        {tasks.map((task) => (
          <div key={task.id} className="space-y-1 p-4">
            <p className="text-sm font-medium">{task.title}</p>
            <p className="text-xs text-muted-foreground">{task.state.replaceAll("_", " ")}</p>
            {task.note ? <p className="text-sm text-muted-foreground">{task.note}</p> : null}
          </div>
        ))}
        {routines.map((routine) => (
          <div key={routine.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{routine.name}</p>
              <p className="text-xs text-muted-foreground">
                {routine.schedule} · {routine.enabled ? "Enabled" : "Paused"}
              </p>
            </div>
            <Button
              size="xs"
              variant="outline"
              disabled={!allowed || pending !== null}
              onClick={async () => {
                setPending(routine.id);
                setError(null);
                const result = await mutate({
                  environmentId,
                  input: { _tag: "routine", routineId: routine.id, enabled: !routine.enabled },
                });
                setPending(null);
                if (result._tag !== "Success") setError(botCommandError(result));
                else query.refresh();
              }}
            >
              {pending === routine.id ? "Saving…" : routine.enabled ? "Pause" : "Resume"}
            </Button>
          </div>
        ))}
        {memories.map((memory) => (
          <p
            key={memory.id}
            className="whitespace-pre-wrap break-words p-4 text-sm leading-relaxed"
          >
            {memory.text}
          </p>
        ))}
        {error ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </ScrollArea>
  );
}

export function BotEmpty({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <Empty size="compact">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </Empty>
  );
}

export function BotPanel({
  environmentId,
  botId: fixedBotId,
}: {
  environmentId: EnvironmentId;
  botId?: string;
}) {
  const state = useBotHq(environmentId);
  const [chosen, setChosen] = useState<string | null>(null);
  const [section, setSection] = useState<(typeof sections)[number]>("Computer");
  const botId =
    fixedBotId ?? (state.bots.some((item) => item.id === chosen) ? chosen : state.bots[0]?.id);
  const bot = state.bots.find((item) => item.id === botId);
  if (!state.data)
    return (
      <BotEmpty
        title={state.error ? "Bot runtime unavailable" : "Loading bots…"}
        description={state.error ?? "Connecting to your assistants."}
        onRetry={state.error ? state.refresh : undefined}
      />
    );
  if (!bot)
    return (
      <BotEmpty
        title="No bot selected"
        description="Create a bot from the left sidebar to give it a conversation and computer."
      />
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      {!fixedBotId ? (
        <div className="border-b p-3">
          <Select
            value={bot.id}
            onValueChange={(value) => {
              setChosen(value);
              setSection("Computer");
            }}
          >
            <SelectTrigger aria-label="Select bot">
              <SelectValue>{bot.name}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {state.bots.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
      ) : null}
      <nav aria-label="Bot information" className="flex shrink-0 flex-wrap gap-1 border-b p-2">
        {sections.map((item) => (
          <Button
            key={item}
            size="xs"
            variant={section === item ? "outline" : "ghost-muted"}
            aria-pressed={section === item}
            onClick={() => setSection(item)}
          >
            {item}
          </Button>
        ))}
      </nav>
      {section === "Computer" ? (
        <BotComputer key={bot.id} environmentId={environmentId} botId={bot.id} />
      ) : (
        <BotDetails
          key={`${bot.id}:${section}`}
          environmentId={environmentId}
          botId={bot.id}
          section={section}
        />
      )}
    </div>
  );
}
