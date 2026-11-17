import { AsyncResult } from "effect/reactivity";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";
import { useBotHqScreenAccess, botHqScreenAccess } from "~/state/botHq";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { useEnvironmentScope } from "~/state/session";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { Button } from "../ui/button";

const loadRfb = () => import("@novnc/novnc");

export function BotComputer({
  environmentId,
  botId,
}: {
  environmentId: EnvironmentId;
  botId: string;
}) {
  const [mode, setMode] = useState<"watch" | "control">("watch");
  const [status, setStatus] = useState("Connecting to computer…");
  const target = useRef<HTMLDivElement>(null);
  const access = useBotHqScreenAccess(environmentId);
  const canControl = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const endpoint = AsyncResult.isSuccess(access) ? access.value : null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns the RFB connection and releases human control when the panel closes or changes bots
  useEffect(() => {
    if (!target.current || endpoint === null) return;
    const container = target.current;
    let disposed = false;
    let disconnect = () => {};
    setStatus("Connecting to computer…");
    void loadRfb()
      .then(({ default: RFB }) => {
        if (disposed) return;
        const url = new URL(endpoint.wsBase);
        for (const [key, value] of Object.entries(endpoint.query)) url.searchParams.set(key, value);
        url.searchParams.set("botId", botId);
        url.searchParams.set("mode", mode);
        const rfb = new RFB(container, url.toString(), { shared: true, wsProtocols: ["binary"] });
        rfb.viewOnly = mode === "watch";
        rfb.scaleViewport = true;
        rfb.resizeSession = false;
        rfb.focusOnClick = mode === "control";
        rfb.background = "transparent";
        rfb.addEventListener("connect", () => {
          if (!disposed) setStatus(mode === "control" ? "You have control" : "Watching");
        });
        rfb.addEventListener("disconnect", () => {
          if (!disposed) setStatus("Computer disconnected. Retry to reconnect.");
        });
        rfb.addEventListener("securityfailure", () => {
          if (!disposed) setStatus("Could not authenticate the computer connection.");
        });
        disconnect = () => rfb.disconnect();
      })
      .catch(() => {
        if (!disposed) setStatus("Could not open the computer viewer.");
      });
    return () => {
      disposed = true;
      disconnect();
      container.replaceChildren();
    };
  }, [endpoint, botId, mode]);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span role="status" className="text-xs text-muted-foreground">
          {AsyncResult.isFailure(access) ? "Computer connection unavailable" : status}
        </span>
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            appAtomRegistry.refresh(botHqScreenAccess(environmentId));
          }}
        >
          Reconnect
        </Button>
      </div>
      <div
        ref={target}
        aria-label="Bot computer screen"
        className="min-h-64 flex-1 overflow-hidden rounded-md border bg-background"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {mode === "control"
            ? "The bot’s computer tools pause while you drive."
            : "Watch the bot or take over to sign in."}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={!canControl}
          onClick={() => setMode(mode === "watch" ? "control" : "watch")}
        >
          {mode === "watch" ? "Take control" : "Hand back"}
        </Button>
      </div>
    </div>
  );
}
