import { useAtomValue } from "@effect/atom-react";
import type { BotHqBot, BotHqMutation, BotHqRow, EnvironmentId } from "@t3tools/contracts";
import { MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon } from "lucide-react";
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
}: {
  environmentId: EnvironmentId;
  bot: BotHqBot;
  rows: ReadonlyArray<BotHqRow>;
}) {
  const allowed = useAtomValue(botHq.mutate.permissionAtom(environmentId));
  const mutate = useAtomCommand(botHq.mutate, { reportFailure: false });
  const [active, setActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const session = useRef<LocalVoiceSession | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the call releases its microphone, playback and capture worker when this bot view closes
  useEffect(() => () => session.current?.stop(), []);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- stream the bot's new transcript text into the active speech player
  useEffect(() => {
    session.current?.observe(rows);
  }, [rows]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- revoking operate permission must stop microphone capture immediately
  useEffect(() => {
    if (!allowed) session.current?.stop();
  }, [allowed]);
  const request = async (input: BotHqMutation) => {
    const result = await mutate({ environmentId, input });
    if (result._tag !== "Success") throw new Error(botCommandError(result));
    return result.value;
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {active ? (
          <span role="status" className="text-xs text-muted-foreground">
            {status} · Local voice
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Talk naturally. Speak to interrupt.</span>
        )}
        <div className="flex gap-1">
          {active ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost-muted"
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              aria-pressed={muted}
              onClick={() => {
                session.current?.mute(!muted);
                setMuted(!muted);
              }}
            >
              {muted ? <MicOffIcon /> : <MicIcon />}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={active ? "destructive" : "outline"}
            disabled={!allowed}
            onClick={async () => {
              if (active) {
                session.current?.stop();
                setActive(false);
                return;
              }
              setError(null);
              setActive(true);
              setMuted(false);
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
                    if (value === "Ended") setActive(false);
                  },
                  onError: setError,
                },
                rows,
              );
              session.current = call;
              try {
                await call.start();
              } catch (cause) {
                call.stop();
                setActive(false);
                setError(cause instanceof Error ? cause.message : "Could not start the call.");
              }
            }}
          >
            {active ? <PhoneOffIcon /> : <PhoneIcon />}
            {active ? "End call" : "Voice call"}
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
