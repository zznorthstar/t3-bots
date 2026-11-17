import { Link, useLocation } from "@tanstack/react-router";
import type { EnvironmentId } from "@t3tools/contracts";
import { BotIcon } from "lucide-react";
import { useBotHq } from "~/state/botHq";
import { useEnvironments } from "~/state/environments";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "../ui/sidebar";

function EnvironmentBots({ environmentId }: { environmentId: EnvironmentId }) {
  const state = useBotHq(environmentId);
  const pathname = useLocation({ select: (location) => location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();
  if (state.bots.length === 0) return null;
  return (
    <SidebarGroup>
      <h2 className="px-2 py-1 text-xs font-medium text-muted-foreground">Bots</h2>
      <SidebarMenu>
        {state.bots.map((bot) => (
          <SidebarMenuItem key={bot.id}>
            <SidebarMenuButton
              render={
                <Link to="/bots/$environmentId/$botId" params={{ environmentId, botId: bot.id }} />
              }
              isActive={pathname.endsWith(`/${environmentId}/${bot.id}`)}
              onClick={() => {
                if (isMobile) setOpenMobile(false);
              }}
              tooltip={bot.label || bot.name}
            >
              <BotIcon />
              <span className="truncate">{bot.name}</span>
              {bot.unread > 0 ? (
                <span className="ml-auto text-xs text-muted-foreground">{bot.unread}</span>
              ) : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export function BotSidebar() {
  const { environments } = useEnvironments();
  return environments
    .filter((environment) => environment.connection.phase === "connected")
    .map((environment) => (
      <EnvironmentBots key={environment.environmentId} environmentId={environment.environmentId} />
    ));
}
