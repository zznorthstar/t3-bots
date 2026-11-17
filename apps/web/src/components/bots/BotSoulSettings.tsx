import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";
import { botHq, useBotHqRead } from "~/state/botHq";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { botCommandError } from "./NewBotDialog";

type Soul = { readonly text: string; readonly version: string | null };
export function BotSoulSettings({
  environmentId,
  botId,
  onDirtyChange,
}: {
  environmentId: EnvironmentId;
  botId: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const query = useBotHqRead(environmentId, { resource: "soul", botId });
  const allowed = useAtomValue(botHq.mutate.permissionAtom(environmentId));
  const mutate = useAtomCommand(botHq.mutate, { reportFailure: false });
  const [draft, setDraft] = useState<Soul | null>(null);
  const [saved, setSaved] = useState<Soul | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const original = saved ?? query.data?.soul;
  const value = draft ?? original;
  return (
    <div className="space-y-2 border-t pt-4">
      <Label htmlFor="bot-soul">SOUL.md</Label>
      <p className="text-xs text-muted-foreground">
        This bot’s personality file. Its existing contents stay intact until you save an edit.
      </p>
      <Textarea
        id="bot-soul"
        className="min-h-48"
        value={value?.text ?? ""}
        placeholder={query.error ? "Could not load SOUL.md" : "Loading SOUL.md…"}
        maxLength={100_000}
        disabled={!allowed || pending || !original}
        onChange={(event) => {
          if (original) {
            onDirtyChange(event.currentTarget.value !== original.text);
            setDraft({
              text: event.currentTarget.value,
              version: draft ? draft.version : original.version,
            });
          }
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!allowed || pending || !draft || draft.text === original?.text}
          onClick={async () => {
            if (!draft) return;
            setPending(true);
            setError(null);
            const result = await mutate({
              environmentId,
              input: { _tag: "soul", botId, ...draft },
            });
            setPending(false);
            if (result._tag !== "Success") {
              setError(botCommandError(result));
              return;
            }
            if (!result.value.soul) {
              setError("The file save did not finish. Your draft is still here.");
              return;
            }
            onDirtyChange(false);
            setSaved(result.value.soul);
            setDraft(null);
          }}
        >
          {pending ? "Saving SOUL.md…" : "Save SOUL.md"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost-muted"
          disabled={pending}
          onClick={() => {
            onDirtyChange(false);
            setDraft(null);
            setSaved(null);
            setError(null);
            query.refresh();
          }}
        >
          Reload file
        </Button>
      </div>
      {error || query.error ? (
        <p role="alert" className="text-xs text-destructive">
          {error ?? query.error}
        </p>
      ) : null}
    </div>
  );
}
