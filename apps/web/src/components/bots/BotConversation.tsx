import { useAtomValue } from "@effect/atom-react";
import { mergeBotRows } from "@t3tools/client-runtime/state/botHq";
import type { BotHqAttachment, BotHqBot, BotHqRow, EnvironmentId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUpIcon,
  MonitorIcon,
  PaperclipIcon,
  SettingsIcon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { botHq, useBotHq, useBotHqRead } from "~/state/botHq";
import { useAtomCommand } from "~/state/use-atom-command";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { isElectron } from "~/env";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { BotPanel, BotEmpty } from "./BotPanel";
import { botCommandError } from "./NewBotDialog";
import ChatMarkdown from "../ChatMarkdown";
import { ChatRightPanel } from "../chat/ChatRightPanel";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { SidebarInset, SidebarTrigger } from "../ui/sidebar";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { ScrollArea } from "../ui/scroll-area";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import type { RightPanelSurface } from "~/rightPanelStore";
import { BotAvatar } from "./BotAvatar";
import { BotSettingsDialog } from "./BotSettingsDialog";
import { BotDictationButton } from "./BotDictationButton";
import { BotVoiceCall } from "./BotVoiceCall";
import { botMessageAuthor } from "./botMessageAuthor";
import { downloadBotAttachment, fileBase64 } from "./botMedia";

const botSurface: RightPanelSurface = { id: "bot", kind: "bot" };
const nothing = () => {};

function BotTranscriptRow({
  row,
  environmentId,
  allowed,
  bot,
  bots,
}: {
  row: BotHqRow;
  environmentId: EnvironmentId;
  allowed: boolean;
  bot: BotHqBot;
  bots: ReadonlyArray<BotHqBot>;
}) {
  const mutate = useAtomCommand(botHq.mutate, { reportFailure: false });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = row.body;
  const author = botMessageAuthor(row, bot, bots);
  const act = async (input: Parameters<typeof mutate>[0]["input"]) => {
    setPending(true);
    setError(null);
    const result = await mutate({ environmentId, input });
    setPending(false);
    if (result._tag !== "Success") setError(botCommandError(result));
  };
  if (body.type === "message")
    return (
      <div className={"flex max-w-full items-start gap-3 " + (author.isUser ? "justify-end" : "")}>
        {!author.isUser ? (
          <BotAvatar bot={author.bot} name={author.name} environmentId={environmentId} />
        ) : null}
        <article
          className={
            author.isUser
              ? "w-fit max-w-[90%] rounded-xl bg-muted px-4 py-3 text-sm"
              : "min-w-0 flex-1 text-sm leading-relaxed"
          }
        >
          <p className="mb-1 text-xs font-medium text-muted-foreground">{author.name}</p>
          {author.isUser || body.role === "user" ? (
            <p className="whitespace-pre-wrap break-words">{body.text}</p>
          ) : (
            <ChatMarkdown
              text={body.text ?? ""}
              cwd={undefined}
              environmentId={environmentId}
              isStreaming={body.streaming ?? false}
            />
          )}
          {body.attachments?.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {body.attachments.map((file) => (
                <Button
                  key={file.id}
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    void downloadBotAttachment(environmentId, row.botId, file).catch(() =>
                      setError("This file could not be downloaded."),
                    )
                  }
                >
                  <PaperclipIcon />
                  <span className="max-w-52 truncate">{file.name}</span>
                </Button>
              ))}
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </article>
      </div>
    );
  if (body.type === "card")
    return (
      <section
        className="space-y-3 rounded-lg border p-4"
        aria-label={body.title ?? body.question ?? "Bot request"}
      >
        <p className="text-sm font-medium">{body.title ?? body.question ?? "Bot request"}</p>
        {body.detail ? <p className="text-sm text-muted-foreground">{body.detail}</p> : null}
        {body.status === "pending" && body.approvalId ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!allowed || pending}
              onClick={() =>
                void act({ _tag: "approve", approvalId: body.approvalId!, decision: "allow" })
              }
            >
              Allow once
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!allowed || pending}
              onClick={() =>
                void act({ _tag: "approve", approvalId: body.approvalId!, decision: "deny" })
              }
            >
              Decline
            </Button>
          </div>
        ) : null}
        {body.status === "pending" && body.card === "question" ? (
          <div className="flex flex-wrap gap-2">
            {body.options?.map((answer) => (
              <Button
                key={answer}
                size="sm"
                variant="outline"
                disabled={!allowed || pending}
                onClick={() => void act({ _tag: "answer", botId: row.botId, seq: row.seq, answer })}
              >
                {answer}
              </Button>
            ))}
            <p className="w-full text-xs text-muted-foreground">
              You can also answer in the conversation.
            </p>
          </div>
        ) : null}
        {body.status !== "pending" ? (
          <p className="text-xs text-muted-foreground">{body.answer ?? body.status}</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>
    );
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      {body.label ?? body.text ?? body.name}
      {body.summary ? ` · ${body.summary}` : ""}
      {body.status === "running" ? "…" : ""}
    </p>
  );
}

export function BotConversation({
  environmentId,
  botId,
}: {
  environmentId: EnvironmentId;
  botId: string;
}) {
  const state = useBotHq(environmentId);
  const transcript = useBotHqRead(environmentId, { resource: "rows", botId });
  const bot = state.bots.find((item) => item.id === botId);
  const mutate = useAtomCommand(botHq.mutate, { reportFailure: false });
  const allowed = useAtomValue(botHq.mutate.permissionAtom(environmentId));
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const narrow = useMediaQuery("(max-width: 760px)");
  const [layout, setLayout] = useState<HTMLDivElement | null>(null);
  const [panelOpen, setPanelOpen] = useState(!narrow);
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [attachments, setAttachments] = useState<BotHqAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [dictationBusy, setDictationBusy] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const resync = useEffectEvent(transcript.refresh);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- fetch the authoritative transcript after reconnecting the runtime event stream
  useEffect(() => {
    if (state.realtime.hello !== null) resync();
  }, [state.realtime.hello]);
  const generation = Math.max(
    transcript.data?.generation ?? bot?.generation ?? 0,
    state.realtime.generations.get(botId) ?? 0,
  );
  const rows = mergeBotRows(
    transcript.data?.rows ?? [],
    state.realtime.rows.get(botId) ?? [],
    generation,
  );
  const lastRevision = rows.at(-1)?.updatedSeq;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- follow streamed messages only while the user stays at the bottom of the transcript
  useEffect(() => {
    if (lastRevision !== undefined && follow.current)
      bottom.current?.scrollIntoView({ block: "end" });
  }, [lastRevision]);
  const live =
    state.realtime.live.get(botId) ?? state.data?.live?.find((item) => item.botId === botId);
  const act = async (input: Parameters<typeof mutate>[0]["input"]) => {
    setPending(true);
    setError(null);
    const result = await mutate({ environmentId, input });
    setPending(false);
    if (result._tag !== "Success") setError(botCommandError(result));
    return result;
  };
  const send = async () => {
    if ((!text.trim() && !attachments.length) || pending || uploading || dictationBusy || !allowed)
      return;
    const submitted = text;
    const result = await act({
      _tag: "send",
      botId,
      text: submitted,
      attachmentIds: attachments.map((file) => file.id),
    });
    if (result._tag === "Success") {
      setText((current) => (current === submitted ? "" : current));
      setAttachments([]);
    }
  };
  const uploadFiles = async (files: File[]) => {
    if (!allowed || uploading) return;
    if (attachments.length + files.length > 10) {
      setError("Attach up to 10 files per message.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          setError(`${file.name} is larger than 10 MB.`);
          break;
        }
        const result = await mutate({
          environmentId,
          input: {
            _tag: "upload",
            botId,
            name: file.name,
            mime: file.type || "application/octet-stream",
            data: await fileBase64(file),
          },
        });
        if (result._tag !== "Success") {
          setError(botCommandError(result));
          break;
        }
        const attachment = result.value.attachment;
        if (!attachment) {
          setError("The file upload did not finish. Retry it.");
          break;
        }
        setAttachments((current) => [...current, attachment]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload this file.");
    }
    setUploading(false);
  };
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden">
      <div ref={setLayout} className="flex h-full min-h-0 min-w-0">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <WorkspacePageHeader electron={isElectron}>
            <SidebarTrigger />
            <BotAvatar bot={bot} environmentId={environmentId} size="small" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-medium">{bot?.name ?? "Bot"}</h1>
            </div>
            <Button
              variant="ghost-muted"
              size="icon-sm"
              aria-label="Open bot panel"
              onClick={() => setPanelOpen(!panelOpen)}
            >
              <MonitorIcon />
            </Button>
            <Button
              variant="ghost-muted"
              size="icon-sm"
              aria-label="Bot settings"
              disabled={!bot}
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon />
            </Button>
            <Button
              variant="ghost-destructive"
              size="icon-sm"
              aria-label="Delete bot"
              disabled={!allowed || !bot}
              onClick={() => setDeleting(true)}
            >
              <Trash2Icon />
            </Button>
          </WorkspacePageHeader>
          {!state.data ? (
            <BotEmpty
              title={state.error ? "Bot runtime unavailable" : "Loading bot…"}
              description={state.error ?? "Connecting to your assistant."}
              onRetry={state.error ? state.refresh : undefined}
            />
          ) : !bot ? (
            <BotEmpty
              title="Bot not found"
              description="This bot may have been deleted. Select another bot from the sidebar."
            />
          ) : (
            <>
              <ScrollArea
                className="min-h-0 flex-1"
                onScrollCapture={(event) => {
                  const viewport = event.target;
                  if (viewport instanceof HTMLElement)
                    follow.current =
                      viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 80;
                }}
              >
                <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8">
                  {rows.length === 0 ? (
                    <BotEmpty
                      title={`Meet ${bot.name}`}
                      description={
                        bot.label ||
                        "Give your assistant a task. Its memory and computer stay with it between conversations."
                      }
                    />
                  ) : (
                    rows.map((row) => (
                      <BotTranscriptRow
                        key={`${row.generation}:${row.seq}`}
                        row={row}
                        environmentId={environmentId}
                        allowed={allowed}
                        bot={bot}
                        bots={state.bots}
                      />
                    ))
                  )}
                  {transcript.error ? (
                    <p role="alert" className="text-sm text-destructive">
                      {transcript.error}{" "}
                      <Button size="xs" variant="outline" onClick={transcript.refresh}>
                        Retry
                      </Button>
                    </p>
                  ) : null}
                  {live?.isRunning ? (
                    <p role="status" className="text-xs text-muted-foreground">
                      {bot.name} is working…
                    </p>
                  ) : null}
                  <div ref={bottom} />
                </div>
              </ScrollArea>
              <form
                className="mx-auto w-full max-w-3xl space-y-2 px-5 pb-5"
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes("Files")) event.preventDefault();
                }}
                onDrop={(event) => {
                  if (event.dataTransfer.files.length) {
                    event.preventDefault();
                    void uploadFiles(Array.from(event.dataTransfer.files));
                  }
                }}
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                {error || state.streamError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error ?? state.streamError}{" "}
                    {state.streamError ? (
                      <Button size="xs" variant="outline" onClick={state.refresh}>
                        Reconnect
                      </Button>
                    ) : null}
                  </p>
                ) : null}
                <Textarea
                  ref={composer}
                  aria-label={`Message ${bot.name}`}
                  value={text}
                  onChange={(event) => setText(event.currentTarget.value)}
                  placeholder={`Message ${bot.name}…`}
                  maxLength={100_000}
                  disabled={!allowed}
                  onPaste={(event) => {
                    if (event.clipboardData.files.length) {
                      event.preventDefault();
                      void uploadFiles(Array.from(event.clipboardData.files));
                    }
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
                <input
                  ref={uploadInput}
                  type="file"
                  multiple
                  hidden
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = "";
                    void uploadFiles(files);
                  }}
                />
                {attachments.length ? (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((file) => (
                      <div
                        key={file.id}
                        className="flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs"
                      >
                        <PaperclipIcon className="size-3" />
                        <span className="max-w-48 truncate">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost-muted"
                          size="icon-micro"
                          aria-label={`Remove ${file.name}`}
                          onClick={() =>
                            setAttachments((current) =>
                              current.filter((item) => item.id !== file.id),
                            )
                          }
                        >
                          <XIcon />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {uploading ? (
                  <p role="status" className="text-xs text-muted-foreground">
                    Uploading attachments…
                  </p>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost-muted"
                      aria-label="Attach files"
                      disabled={!allowed || uploading || pending}
                      onClick={() => uploadInput.current?.click()}
                    >
                      <PaperclipIcon />
                    </Button>
                    <p className="truncate text-xs text-muted-foreground">
                      {allowed
                        ? [bot.provider, bot.model].filter(Boolean).join(" · ") ||
                          "Hermes · Persistent assistant"
                        : "Read-only connection"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {live?.isRunning ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label="Stop bot"
                        disabled={!allowed || pending}
                        onClick={() => void act({ _tag: "interrupt", botId })}
                      >
                        <SquareIcon />
                      </Button>
                    ) : null}
                    <BotDictationButton
                      environmentId={environmentId}
                      botId={botId}
                      disabled={callActive || pending}
                      onText={(dictated) => {
                        setText((current) =>
                          current.trim() ? `${current.trimEnd()} ${dictated}` : dictated,
                        );
                        composer.current?.focus();
                      }}
                      onError={setError}
                      onBusyChange={setDictationBusy}
                    />
                    <BotVoiceCall
                      environmentId={environmentId}
                      bot={bot}
                      rows={rows}
                      disabled={dictationBusy}
                      onActiveChange={setCallActive}
                      onError={setError}
                    />
                    <Button
                      type="submit"
                      size="icon-sm"
                      aria-label="Send message"
                      disabled={
                        !allowed ||
                        (!text.trim() && !attachments.length) ||
                        pending ||
                        uploading ||
                        dictationBusy
                      }
                    >
                      <ArrowUpIcon />
                    </Button>
                  </div>
                </div>
              </form>
            </>
          )}
        </section>
        {panelOpen ? (
          <ChatRightPanel
            sheet={narrow}
            maximized={false}
            workspaceLayoutElement={layout}
            widthStorageKey="t3code:bot-panel-width"
            sheetAnimationDurationMs={0}
            onCloseSheet={() => setPanelOpen(false)}
            open
            keybindings={keybindings}
            getShortcutContext={() => ({
              terminalFocus: false,
              terminalOpen: false,
              previewFocus: false,
              previewOpen: false,
              isWeb: !isElectron,
              isDesktop: isElectron,
            })}
            surfaces={[botSurface]}
            environmentId={environmentId}
            activeSurfaceId="bot"
            pendingSurfaceIds={new Set()}
            previewSessions={{}}
            desktopByTabId={{}}
            terminalLabelsById={new Map()}
            onActivate={nothing}
            onCloseSurface={() => setPanelOpen(false)}
            onCloseOtherSurfaces={nothing}
            onCloseSurfacesToRight={nothing}
            onCloseAllSurfaces={() => setPanelOpen(false)}
            onCopyFilePath={nothing}
            onAddBrowser={nothing}
            onAddBrowserInProfile={nothing}
            onAddTerminal={nothing}
            onAddDiff={nothing}
            onAddFiles={nothing}
            onAddPullRequest={nothing}
            onAddPullRequests={nothing}
            onAddDevice={nothing}
            onAddBot={() => setPanelOpen(true)}
            browserAvailable={false}
            terminalAvailable={false}
            diffAvailable={false}
            filesAvailable={false}
            pullRequestAvailable={false}
            pullRequestsAvailable={false}
            deviceAvailable={false}
          >
            <BotPanel environmentId={environmentId} botId={botId} />
          </ChatRightPanel>
        ) : null}
        <Dialog open={deleting} onOpenChange={setDeleting}>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>Delete {bot?.name ?? "bot"}?</DialogTitle>
              <DialogDescription>
                {bot?.engineKind === "primary" || bot?.engineKind === "linked"
                  ? "This disconnects Hermes from T3 + Bots and removes this app’s conversation and uploaded files. Your Hermes agent and Discord connection stay available."
                  : "This removes this bot’s conversation, memory, files and managed computer."}
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <p role="alert" className="px-6 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button variant="outline" disabled={pending} onClick={() => setDeleting(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={pending || !allowed}
                onClick={async () => {
                  const result = await act({ _tag: "delete", botId });
                  if (result._tag === "Success") void navigate({ to: "/" });
                }}
              >
                {pending ? "Deleting…" : "Delete bot"}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
        {settingsOpen && bot ? (
          <BotSettingsDialog
            bot={bot}
            environmentId={environmentId}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}
      </div>
    </SidebarInset>
  );
}
