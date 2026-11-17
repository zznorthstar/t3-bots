import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { EnvironmentId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { BotIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { botHq } from "~/state/botHq";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";
import { useEnvironments } from "~/state/environments";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { subscribeNewBot } from "./botCreation";
import { SidebarHeaderIconButton } from "../sidebar/SidebarThreadHeader";

export function botCommandError(result: Parameters<typeof squashAtomCommandFailure>[0]) {
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "The bot request could not be completed.";
}

function NewBotDialog({
  environmentId: initial,
  onClose,
}: {
  environmentId: EnvironmentId;
  onClose: () => void;
}) {
  const [environmentId, setEnvironmentId] = useState(initial);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [instructions, setInstructions] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = useAtomValue(botHq.mutate.permissionAtom(environmentId));
  const mutate = useAtomCommand(botHq.mutate, { reportFailure: false });
  const navigate = useNavigate();
  const { environments } = useEnvironments();
  const create = async () => {
    if (!name.trim() || pending || !allowed) return;
    setPending(true);
    setError(null);
    const result = await mutate({
      environmentId,
      input: { _tag: "create", name: name.trim(), label: role.trim(), instructions },
    });
    setPending(false);
    if (result._tag !== "Success") {
      setError(botCommandError(result));
      return;
    }
    if (!result.value.bot) {
      setError("The runtime did not return the new bot. Retry loading the bot list.");
      return;
    }
    onClose();
    void navigate({
      to: "/bots/$environmentId/$botId",
      params: { environmentId, botId: result.value.bot.id },
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogPopup>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <DialogHeader>
            <DialogTitle>Create a bot</DialogTitle>
            <DialogDescription>
              A persistent assistant with its own memory and local computer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-6">
            {environments.length > 1 ? (
              <div className="space-y-2">
                <Label>Environment</Label>
                <Select
                  value={environmentId}
                  onValueChange={(value) => {
                    if (value) setEnvironmentId(EnvironmentId.make(value));
                  }}
                >
                  <SelectTrigger aria-label="Bot environment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {environments.map((environment) => (
                      <SelectItem key={environment.environmentId} value={environment.environmentId}>
                        {environment.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="bot-name">Name</Label>
              <Input
                id="bot-name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                maxLength={60}
                required
                placeholder="Chief of Staff"
                autoFocus
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bot-role">Role</Label>
              <Input
                id="bot-role"
                value={role}
                onChange={(event) => setRole(event.currentTarget.value)}
                maxLength={200}
                placeholder="Coordinate projects and follow up on tasks"
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bot-instructions">Instructions</Label>
              <Textarea
                id="bot-instructions"
                value={instructions}
                onChange={(event) => setInstructions(event.currentTarget.value)}
                maxLength={20_000}
                placeholder="How should this bot work with you?"
                disabled={pending}
              />
            </div>
            {!allowed ? (
              <p className="text-sm text-muted-foreground">
                This connection does not have permission to create bots.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!allowed || !name.trim() || pending}>
              {pending ? "Creating…" : "Create bot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

export function NewBotAction() {
  const primary = useAtomValue(primaryEnvironmentIdAtom);
  const { environments } = useEnvironments();
  const environmentId =
    primary ??
    environments.find((environment) => environment.connection.phase === "connected")
      ?.environmentId ??
    null;
  const [open, setOpen] = useState(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the command palette opens the same bot dialog as the sidebar action
  useEffect(() => subscribeNewBot(() => setOpen(true)), []);
  return (
    <>
      <SidebarHeaderIconButton
        label="New bot"
        onClick={() => setOpen(true)}
        disabled={environmentId === null}
      >
        <BotIcon />
      </SidebarHeaderIconButton>
      {open && environmentId !== null ? (
        <NewBotDialog environmentId={environmentId} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
