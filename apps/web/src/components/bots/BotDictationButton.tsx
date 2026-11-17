import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { LoaderCircleIcon, MicIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { botHq } from "~/state/botHq";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { BotDictationSession } from "./BotDictationSession";
import { botCommandError } from "./NewBotDialog";

export function BotDictationButton({
  environmentId,
  botId,
  disabled,
  onText,
  onError,
  onBusyChange,
}: {
  environmentId: EnvironmentId;
  botId: string;
  disabled: boolean;
  onText: (text: string) => void;
  onError: (message: string | null) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const allowed = useAtomValue(botHq.mutate.permissionAtom(environmentId));
  const mutate = useAtomCommand(botHq.mutate, { reportFailure: false });
  const capture = useRef<BotDictationSession | null>(null);
  const current = useRef(0);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- navigating away or revoking operate permission must release the microphone and discard late transcriptions
  useEffect(() => {
    if (!allowed) {
      current.current++;
      capture.current?.cancel();
      capture.current = null;
    }
    return () => {
      current.current++;
      capture.current?.cancel();
    };
  }, [allowed]);
  const finish = async () => {
    const session = capture.current;
    if (!session) return;
    const epoch = current.current;
    setRecording(false);
    setTranscribing(true);
    try {
      const audio = await session.stop();
      if (epoch !== current.current) return;
      if (!audio) {
        setTranscribing(false);
        onBusyChange(false);
        return;
      }
      const result = await mutate({
        environmentId,
        input: { _tag: "voice-transcribe", botId, data: audio },
      });
      if (epoch === current.current) {
        if (result._tag === "Success") {
          if (result.value.text?.trim()) onText(result.value.text.trim());
        } else onError(botCommandError(result));
      }
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Dictation stopped. Retry.");
    }
    if (capture.current === session) capture.current = null;
    if (epoch === current.current) {
      setTranscribing(false);
      onBusyChange(false);
    }
  };
  return (
    <Button
      type="button"
      size="icon-sm"
      variant={recording ? "destructive" : "ghost-muted"}
      aria-label={
        transcribing ? "Transcribing dictation" : recording ? "Stop dictation" : "Dictate prompt"
      }
      title={transcribing ? "Transcribing…" : recording ? "Stop dictation" : "Dictate prompt"}
      aria-pressed={recording}
      disabled={!allowed || disabled || transcribing}
      onClick={async () => {
        if (recording) {
          await finish();
          return;
        }
        onError(null);
        onBusyChange(true);
        setRecording(true);
        const epoch = ++current.current;
        const session = new BotDictationSession({
          onCanceled: () => {
            setRecording(false);
            setTranscribing(false);
            onBusyChange(false);
          },
          onLimit: () => void finish(),
          onError: (message) => {
            onError(message);
            setRecording(false);
            onBusyChange(false);
          },
        });
        capture.current = session;
        try {
          await session.start();
        } catch (cause) {
          session.cancel();
          if (epoch === current.current) {
            capture.current = null;
            setRecording(false);
            onBusyChange(false);
            onError(cause instanceof Error ? cause.message : "Could not open the microphone.");
          }
        }
      }}
    >
      {transcribing ? (
        <LoaderCircleIcon className="animate-spin" />
      ) : recording ? (
        <SquareIcon />
      ) : (
        <MicIcon />
      )}
    </Button>
  );
}
