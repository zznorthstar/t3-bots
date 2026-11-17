import { createFileRoute } from "@tanstack/react-router";
import { EnvironmentId } from "@t3tools/contracts";
import { BotConversation } from "~/components/bots/BotConversation";

export const Route = createFileRoute("/_chat/bots/$environmentId/$botId")({ component: BotRoute });

function BotRoute() {
  const { environmentId, botId } = Route.useParams();
  return (
    <BotConversation
      key={`${environmentId}:${botId}`}
      environmentId={EnvironmentId.make(environmentId)}
      botId={botId}
    />
  );
}
