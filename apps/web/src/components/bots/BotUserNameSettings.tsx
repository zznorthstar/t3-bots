import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";
import { botHq, useBotHqRead } from "~/state/botHq";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { botCommandError } from "./NewBotDialog";

function UserNameField({ environmentId }: { environmentId: EnvironmentId }) {
  const query = useBotHqRead(environmentId, { resource: "preferences" });
  const allowed = useAtomValue(botHq.mutate.permissionAtom(environmentId));
  const mutate = useAtomCommand(botHq.mutate, { reportFailure: false });
  const [draft, setDraft] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const value = draft ?? query.data?.preferences?.displayName ?? "user";
  return (
    <div className="space-y-2">
      <Label htmlFor="bots-your-name">Your name</Label>
      <p className="text-xs text-muted-foreground">
        One name for all your bots. Defaults to “user”.
      </p>
      <div className="flex max-w-md gap-2">
        <Input
          id="bots-your-name"
          value={value}
          maxLength={60}
          placeholder="user"
          disabled={!allowed || pending || !query.data}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setSaved(false);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!allowed || pending || !query.data || draft === null}
          onClick={async () => {
            setPending(true);
            setError(null);
            setSaved(false);
            const result = await mutate({
              environmentId,
              input: { _tag: "preferences", displayName: value.trim() || "user" },
            });
            setPending(false);
            if (result._tag !== "Success") {
              setError(botCommandError(result));
              return;
            }
            setDraft(result.value.preferences?.displayName ?? (value.trim() || "user"));
            setSaved(true);
          }}
        >
          {pending ? "Saving…" : "Save name"}
        </Button>
      </div>
      {saved ? (
        <p role="status" className="text-xs text-muted-foreground">
          Saved for all bots.
        </p>
      ) : null}
      {error || query.error ? (
        <p role="alert" className="text-xs text-destructive">
          {error ?? query.error}{" "}
          <Button type="button" size="xs" variant="ghost-muted" onClick={query.refresh}>
            Retry
          </Button>
        </p>
      ) : null}
    </div>
  );
}

export function BotUserNameSettings() {
  const environmentId = useAtomValue(primaryEnvironmentIdAtom);
  return environmentId ? <UserNameField environmentId={environmentId} /> : null;
}
