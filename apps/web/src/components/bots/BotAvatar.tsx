import type { BotHqBot, EnvironmentId } from "@t3tools/contracts";
import { useBotHqRead } from "~/state/botHq";

export function BotAvatar({
  bot,
  environmentId,
  name,
  size = "chat",
}: {
  bot?: BotHqBot | undefined;
  environmentId: EnvironmentId;
  name?: string;
  size?: "small" | "chat" | "large";
}) {
  const avatar = useBotHqRead(
    environmentId,
    { resource: "avatar", botId: bot?.id ?? "", version: bot?.avatarVersion ?? "" },
    !!bot?.avatarVersion,
  );
  const label = bot?.name ?? name ?? "Bot";
  return (
    <span
      aria-hidden="true"
      className={
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-muted-foreground " +
        (size === "small"
          ? "size-5 text-[10px]"
          : size === "large"
            ? "size-16 text-xl"
            : "size-8 text-xs")
      }
    >
      {avatar.data?.avatar ? (
        <img src={avatar.data.avatar} alt="" className="size-full object-cover" />
      ) : (
        label.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
