import { useAtomValue } from "@effect/atom-react";
import type { BotHqBot, BotHqMutation, BotHqRow, EnvironmentId } from "@t3tools/contracts";
import { PhoneIcon, PhoneOffIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { botHq } from "~/state/botHq";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { LocalVoiceSession } from "./LocalVoiceSession";
import { botCommandError } from "./NewBotDialog";

export function BotVoiceCall({
  environmentId,
  bot,
  rows,
  disabled,
  onActiveChange,
  onError,
}: {
  environmentId: EnvironmentId;
  bot: BotHqBot;
  rows: ReadonlyArray<BotHqRow>;
  disabled: boolean;
  onActiveChange: (active: boolean) => void;
  onError: (message: string | null) => void;
}) {
  const allowed = useAtomValue(botHq.mutate.permissionAtom(environmentId));
  const mutate = useAtomCommand(botHq.mutate, { reportFailure: false });
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("");
  const session = useRef<LocalVoiceSession | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- closing the bot view releases its live call microphone and playback
  useEffect(() => () => session.current?.stop(), []);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- streamed bot replies feed the active speech player
  useEffect(() => {
    session.current?.observe(rows);
  }, [rows]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- losing operate permission must stop microphone capture
  useEffect(() => {
    if (!allowed) session.current?.stop();
  }, [allowed]);
  const request = async (input: BotHqMutation) => {
    const result = await mutate({ environmentId, input });
    if (result._tag !== "Success") throw new Error(botCommandError(result));
    return result.value;
  };
  return (
    <>
      <Button
        type="button"
        size="icon-sm"
        variant={active ? "destructive" : "ghost-muted"}
        aria-label={active ? "End call" : "Start voice call"}
        title={active ? `${status} · End call` : "Start voice call"}
        aria-pressed={active}
        disabled={!allowed || disabled}
        onClick={async () => {
          if (active) {
            session.current?.stop();
            return;
          }
          onError(null);
          setActive(true);
          onActiveChange(true);
          const call = new LocalVoiceSession(
            {
              warm: async () => {
                await request({ _tag: "voice-warm" });
              },
              transcribe: async (data) =>
                (await request({ _tag: "voice-transcribe", botId: bot.id, data })).text ?? "",
              speak: async (text) => {
                const result = await request({
                  _tag: "voice-speak",
                  botId: bot.id,
                  text,
                  voice: bot.localVoice ?? "af_heart",
                });
                if (!result.audio) throw new Error("No speech audio was returned.");
                return result.audio.data;
              },
              send: async (text) => {
                await request({ _tag: "send", botId: bot.id, text, voice: true });
              },
              interrupt: async () => {
                await request({ _tag: "interrupt", botId: bot.id });
              },
              onState: (value) => {
                setStatus(value);
                if (value === "Ended") {
                  setActive(false);
                  onActiveChange(false);
                }
              },
              onError,
            },
            rows,
          );
          session.current = call;
          try {
            await call.start();
          } catch (cause) {
            call.stop();
            onError(cause instanceof Error ? cause.message : "Could not start the call.");
          }
        }}
      >
        {active ? <PhoneOffIcon /> : <PhoneIcon />}
      </Button>
      {active ? (
        <span className="sr-only" role="status">
          {status}
        </span>
      ) : null}
    </>
  );
}
