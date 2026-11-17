import { AuthOrchestrationOperateScope, AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { authenticateMediaRequest } from "../auth/http.ts";
import * as BotHq from "./BotHq.ts";

export const layer = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const bots = yield* BotHq.BotHq;
    yield* router.add(
      "GET",
      "/api/bot-hq/screen",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const url = new URL(request.url, "http://localhost");
        const mode = url.searchParams.get("mode") === "control" ? "control" : "watch";
        yield* authenticateMediaRequest(
          mode === "control" ? AuthOrchestrationOperateScope : AuthOrchestrationReadScope,
        );
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const upstream = yield* bots.screen(url.searchParams.get("botId") ?? "", mode);
            const downstream = yield* request.upgrade;
            const upReader = yield* upstream.reader;
            const upWriter = yield* upstream.writer;
            const downReader = yield* downstream.reader;
            const downWriter = yield* downstream.writer;
            yield* Effect.raceFirst(
              Effect.forever(upReader.pull.pipe(Effect.flatMap(downWriter.writeAll))),
              Effect.forever(downReader.pull.pipe(Effect.flatMap(upWriter.writeAll))),
            ).pipe(Effect.ignore);
            return HttpServerResponse.empty();
          }),
        ).pipe(
          Effect.catchTags({
            BotHqError: () =>
              Effect.succeed(HttpServerResponse.text("Bot computer unavailable", { status: 503 })),
          }),
        );
      }),
    );
  }),
);
