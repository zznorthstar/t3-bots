import { useAtomValue } from "@effect/atom-react";
import type { BotHqBot, EnvironmentId } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { botHq, useBotHqRead } from "~/state/botHq";
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
import { BotAvatar } from "./BotAvatar";
import { avatarDataUrl } from "./botMedia";
import { botCommandError } from "./NewBotDialog";

const localVoiceNames = {
  af_heart: "Heart",
  af_bella: "Bella",
  af_nicole: "Nicole",
  am_adam: "Adam",
  am_michael: "Michael",
  bf_emma: "Emma",
  bm_george: "George",
};

export function BotSettingsDialog({
  bot,
  environmentId,
  onClose,
}: {
  bot: BotHqBot;
  environmentId: EnvironmentId;
  onClose: () => void;
}) {
  const [name, setName] = useState(bot.name);
  const [label, setLabel] = useState(bot.label);
  const [instructions, setInstructions] = useState(bot.instructions);
  const [voice, setVoice] = useState(bot.localVoice ?? "af_heart");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  const allowed = useAtomValue(botHq.mutate.permissionAtom(environmentId));
  const mutate = useAtomCommand(botHq.mutate, { reportFailure: false });
  const speech = useBotHqRead(environmentId, { resource: "voice" });
  const updatePhoto = async (file: File | null) => {
    setPending(true);
    setError(null);
    try {
      const result = await mutate({
        environmentId,
        input: { _tag: "avatar", botId: bot.id, dataUrl: file ? await avatarDataUrl(file) : null },
      });
      if (result._tag !== "Success") setError(botCommandError(result));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this photo.");
    }
    setPending(false);
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
          onSubmit={async (event) => {
            event.preventDefault();
            if (!allowed || pending || !name.trim()) return;
            setPending(true);
            setError(null);
            const result = await mutate({
              environmentId,
              input: {
                _tag: "profile",
                botId: bot.id,
                name: name.trim(),
                label,
                instructions,
                localVoice: voice,
              },
            });
            setPending(false);
            if (result._tag === "Success") onClose();
            else setError(botCommandError(result));
          }}
        >
          <DialogHeader>
            <DialogTitle>{bot.name}’s settings</DialogTitle>
            <DialogDescription>
              Give your assistant a face, a voice and instructions.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60dvh] space-y-4 overflow-y-auto p-6">
            <div className="flex items-center gap-4">
              <BotAvatar bot={bot} environmentId={environmentId} size="large" />
              <div className="flex flex-wrap gap-2">
                <input
                  ref={photo}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) void updatePhoto(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!allowed || pending}
                  onClick={() => photo.current?.click()}
                >
                  Upload photo
                </Button>
                {bot.avatarVersion ? (
                  <Button
                    type="button"
                    variant="ghost-muted"
                    size="sm"
                    disabled={!allowed || pending}
                    onClick={() => void updatePhoto(null)}
                  >
                    Remove photo
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bot-settings-name">Name</Label>
              <Input
                id="bot-settings-name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                maxLength={60}
                disabled={!allowed || pending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bot-settings-role">Role</Label>
              <Input
                id="bot-settings-role"
                value={label}
                onChange={(event) => setLabel(event.currentTarget.value)}
                maxLength={200}
                disabled={!allowed || pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bot-settings-instructions">Instructions</Label>
              <Textarea
                id="bot-settings-instructions"
                value={instructions}
                onChange={(event) => setInstructions(event.currentTarget.value)}
                maxLength={20_000}
                disabled={!allowed || pending}
              />
            </div>
            <div className="space-y-2">
              <Label>Voice</Label>
              <Select
                value={voice}
                onValueChange={(value) => {
                  if (value) setVoice(value);
                }}
                disabled={!allowed || pending}
              >
                <SelectTrigger aria-label="Bot voice">
                  <SelectValue>
                    {localVoiceNames[voice as keyof typeof localVoiceNames] ?? "Heart"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {Object.entries(localVoiceNames).map(([id, title]) => (
                    <SelectItem key={id} value={id}>
                      {title}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <p className="text-xs text-muted-foreground">
                Speech runs on this computer. You can interrupt the bot while it speaks.
              </p>
              {speech.data?.voice && !speech.data.voice.installed ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!allowed || pending}
                  onClick={async () => {
                    setPending(true);
                    setError(null);
                    const result = await mutate({ environmentId, input: { _tag: "voice-setup" } });
                    setPending(false);
                    speech.refresh();
                    if (result._tag !== "Success") setError(botCommandError(result));
                  }}
                >
                  Install local voice models
                </Button>
              ) : null}
            </div>
            {bot.engineKind === "primary" ? (
              <p className="text-xs text-muted-foreground">
                Linked to your existing Hermes agent. Her Discord connection, memory and tools stay
                with her.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!allowed || pending || !name.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
