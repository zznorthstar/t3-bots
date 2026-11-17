import { BotHqError } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientResponse } from "effect/http";
import * as BotHq from "./BotHq.ts";

const isBotHqError = Schema.is(BotHqError);
const socketState = vi.hoisted(() => ({ closed: 0 }));
vi.mock("undici", () => ({
  WebSocket: class extends EventTarget {
    readyState = 1;
    binaryType = "arraybuffer";
    close() {
      socketState.closed++;
    }
  },
}));

const response = (
  request: HttpClientResponse.HttpClientResponse["request"],
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
) =>
  HttpClientResponse.fromWeb(
    request,
    new Response(JSON.stringify(body), { status, ...(headers ? { headers } : {}) }),
  );

describe("Bot HQ adapter", () => {
  it.effect("closes the upstream desktop transport when its viewer scope ends", () => {
    socketState.closed = 0;
    const client = HttpClient.make((request) =>
      Effect.succeed(
        response(request, {}, 200, { "set-cookie": "grokbot_session=test; HttpOnly" }),
      ),
    );
    return Effect.gen(function* () {
      const bots = yield* BotHq.BotHq;
      yield* Effect.scoped(
        Effect.gen(function* () {
          const socket = yield* bots.screen("bot_one", "control");
          yield* socket.reader;
        }),
      );
      expect(socketState.closed).toBe(1);
    }).pipe(
      Effect.provide(
        BotHq.layer.pipe(
          Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({ BOT_HQ_URL: "http://127.0.0.1:8787" }),
            ),
          ),
        ),
      ),
    );
  });

  it.effect("waits for a newly provisioning Hermes bot to finish deletion", () =>
    Effect.gen(function* () {
      const deleting = yield* Deferred.make<void>();
      const client = HttpClient.make((request) =>
        request.url.endsWith("/auth/dev")
          ? Effect.succeed(
              response(request, {}, 200, { "set-cookie": "grokbot_session=test; HttpOnly" }),
            )
          : Effect.gen(function* () {
              expect(request.method).toBe("DELETE");
              yield* Deferred.succeed(deleting, undefined);
              yield* Effect.sleep("35 seconds");
              return response(request, { ok: true });
            }),
      );
      return yield* Effect.gen(function* () {
        const bots = yield* BotHq.BotHq;
        const result = yield* bots
          .mutate({ _tag: "delete", botId: "bot_new" })
          .pipe(Effect.forkChild);
        yield* Deferred.await(deleting);
        yield* TestClock.adjust("35 seconds");
        expect(yield* Fiber.join(result)).toEqual({ ok: true });
      }).pipe(
        Effect.provide(
          BotHq.layer.pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
            Layer.provide(
              ConfigProvider.layer(
                ConfigProvider.fromUnknown({ BOT_HQ_URL: "http://127.0.0.1:8787" }),
              ),
            ),
          ),
        ),
      );
    }),
  );

  it.effect(
    "shares an authenticated runtime session and reauthenticates after a runtime restart",
    () => {
      const requests: Array<{ url: string; cookie: string | undefined }> = [];
      let signIns = 0;
      let restarted = false;
      const client = HttpClient.make((request) =>
        Effect.sync(() => {
          requests.push({ url: request.url, cookie: request.headers.cookie });
          if (request.url.endsWith("/auth/dev")) {
            signIns++;
            return response(request, { ok: true }, 200, {
              "set-cookie": `grokbot_session=session-${signIns}; HttpOnly; Path=/`,
            });
          }
          if (restarted && request.headers.cookie === "grokbot_session=session-1")
            return response(request, {}, 401);
          return response(request, { bots: [], live: [] });
        }),
      );
      return Effect.gen(function* () {
        const bots = yield* BotHq.BotHq;
        yield* bots.read({ resource: "bots" });
        yield* bots.read({ resource: "bots" });
        expect(signIns).toBe(1);
        restarted = true;
        yield* bots.read({ resource: "bots" });
        expect(signIns).toBe(2);
        expect(requests.at(-1)?.cookie).toBe("grokbot_session=session-2");
      }).pipe(
        Effect.provide(
          BotHq.layer.pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
            Layer.provide(
              ConfigProvider.layer(
                ConfigProvider.fromUnknown({ BOT_HQ_URL: "http://127.0.0.1:8787" }),
              ),
            ),
          ),
        ),
      );
    },
  );

  it.effect("rejects off-machine origins and traversal before contacting the runtime", () => {
    const client = HttpClient.make(() => Effect.die("No HTTP request should be sent"));
    const program = Effect.gen(function* () {
      const bots = yield* BotHq.BotHq;
      const traversal = yield* bots
        .mutate({ _tag: "delete", botId: "../auth/logout" })
        .pipe(Effect.flip);
      expect(traversal.reason).toBe("invalid_request");
      const origin = yield* bots.read({ resource: "bots" }).pipe(Effect.flip);
      expect(origin.reason).toBe("invalid_request");
    });
    return program.pipe(
      Effect.provide(
        BotHq.layer.pipe(
          Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
          Layer.provide(
            ConfigProvider.layer(ConfigProvider.fromUnknown({ BOT_HQ_URL: "http://example.com" })),
          ),
        ),
      ),
    );
  });

  it.effect("decodes runtime events and fails on malformed upstream data", () => {
    const client = HttpClient.make((request) =>
      Effect.succeed(
        request.url.endsWith("/auth/dev")
          ? response(request, {}, 200, { "set-cookie": "grokbot_session=test; HttpOnly" })
          : HttpClientResponse.fromWeb(
              request,
              new Response(
                'data: {"type":"hello"}\n\ndata: {"type":"roster"}\n\ndata: broken\n\n',
                { headers: { "content-type": "text/event-stream" } },
              ),
            ),
      ),
    );
    return Effect.gen(function* () {
      const bots = yield* BotHq.BotHq;
      const events: string[] = [];
      const failure = yield* bots.events.pipe(
        Stream.tap((event) => Effect.sync(() => events.push(event.type))),
        Stream.runDrain,
        Effect.flip,
      );
      expect(events).toEqual(["hello", "roster"]);
      expect(isBotHqError(failure)).toBe(true);
      expect(failure.reason).toBe("request_failed");
    }).pipe(
      Effect.provide(
        BotHq.layer.pipe(
          Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({ BOT_HQ_URL: "http://localhost:8787" }),
            ),
          ),
        ),
      ),
    );
  });
});
