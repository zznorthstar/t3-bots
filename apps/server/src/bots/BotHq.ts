import {
  BotHqError,
  BotHqReadResult,
  BotHqMutationResult,
  BotHqEvent,
  type BotHqReadInput,
  type BotHqMutation,
} from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientRequest } from "effect/http";
import * as Socket from "effect/socket/Socket";
import * as Undici from "undici";

export class BotHq extends Context.Service<
  BotHq,
  {
    readonly read: (
      input: BotHqReadInput,
    ) => Effect.Effect<typeof BotHqReadResult.Type, BotHqError>;
    readonly mutate: (
      input: BotHqMutation,
    ) => Effect.Effect<typeof BotHqMutationResult.Type, BotHqError>;
    readonly events: Stream.Stream<BotHqEvent, BotHqError>;
    readonly screen: (
      botId: string,
      mode: "watch" | "control",
    ) => Effect.Effect<Socket.Socket, BotHqError>;
  }
>()("t3/bots/BotHq") {}

const decodeEvent = Schema.decodeEffect(Schema.fromJsonString(BotHqEvent));
const isBotHqError = Schema.is(BotHqError);

const validId = (id: string | undefined) => id !== undefined && /^[\w-]{1,100}$/.test(id);

const mutationRequest = (input: BotHqMutation) => {
  if ("botId" in input && !validId(input.botId)) return null;
  const base = "botId" in input ? `/bots/${input.botId}` : "";
  switch (input._tag) {
    case "create":
      return input.name.trim().length > 0 && input.name.length <= 60
        ? {
            method: "POST" as const,
            path: "/bots",
            body: {
              name: input.name,
              label: input.label,
              instructions: input.instructions,
              avatarShape: "blob",
              avatarColor: "violet",
              mode: "personal",
            },
          }
        : null;
    case "send":
      return input.text.trim().length > 0 && input.text.length <= 100_000
        ? { method: "POST" as const, path: `${base}/messages`, body: { text: input.text } }
        : null;
    case "interrupt":
      return { method: "POST" as const, path: `${base}/interrupt` };
    case "fresh":
      return { method: "POST" as const, path: `${base}/fresh` };
    case "reset":
      return { method: "POST" as const, path: `${base}/screen/reset` };
    case "delete":
      return { method: "DELETE" as const, path: base };
    case "approve":
      return validId(input.approvalId)
        ? {
            method: "POST" as const,
            path: `/approvals/${input.approvalId}`,
            body: { decision: input.decision },
          }
        : null;
    case "answer":
      return Number.isSafeInteger(input.seq) && input.seq > 0
        ? {
            method: "POST" as const,
            path: `${base}/cards/${input.seq}/answer`,
            body: { answer: input.answer },
          }
        : null;
    case "routine":
      return validId(input.routineId)
        ? {
            method: "PATCH" as const,
            path: `/routines/${input.routineId}`,
            body: { enabled: input.enabled },
          }
        : null;
  }
};

const make = Effect.gen(function* () {
  const configured = yield* Config.String("BOT_HQ_URL").pipe(Config.withDefault(""), Effect.orDie);
  const client = yield* HttpClient.HttpClient;
  const cookie = yield* Ref.make<string | null>(null);
  const loginLock = yield* Semaphore.make(1);
  const origin = Effect.try({
    try: () => {
      const url = new URL(configured);
      if (
        url.protocol !== "http:" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.pathname !== "/"
      )
        throw new Error("loopback required");
      return url.origin;
    },
    catch: (cause) =>
      new BotHqError({ reason: configured ? "invalid_request" : "not_configured", cause }),
  });
  const signIn = Effect.fn("BotHq.signIn")(function* () {
    const cached = yield* Ref.get(cookie);
    if (cached !== null) return cached;
    const base = yield* origin;
    const request = HttpClientRequest.post(`${base}/api/auth/dev`).pipe(
      HttpClientRequest.bodyJson({ email: "t3@localhost", name: "T3" }),
    );
    const response = yield* Effect.flatMap(request, client.execute).pipe(
      Effect.timeout("5 seconds"),
      Effect.mapError((cause) => new BotHqError({ reason: "unavailable", cause })),
    );
    const session = response.headers["set-cookie"]?.split(";")[0];
    if (response.status !== 200 || !session)
      return yield* new BotHqError({ reason: "authentication" });
    yield* Ref.set(cookie, session);
    return session;
  }, loginLock.withPermits(1));
  const request = Effect.fn("BotHq.request")(function* (
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ) {
    const base = yield* origin;
    const execute = Effect.fn("BotHq.execute")(function* () {
      const session = yield* signIn();
      const raw = HttpClientRequest.make(method)(`${base}/api${path}`).pipe(
        HttpClientRequest.setHeader("cookie", session),
      );
      const input =
        body === undefined
          ? raw
          : yield* HttpClientRequest.bodyJson(raw, body).pipe(
              Effect.mapError((cause) => new BotHqError({ reason: "invalid_request", cause })),
            );
      return yield* client.execute(input).pipe(
        Effect.timeout(method === "DELETE" ? "2 minutes" : "30 seconds"),
        Effect.mapError((cause) => new BotHqError({ reason: "unavailable", cause })),
      );
    });
    let response = yield* execute();
    if (response.status === 401) {
      yield* Ref.set(cookie, null);
      response = yield* execute();
    }
    if (response.status < 200 || response.status >= 300)
      return yield* new BotHqError({ reason: "request_failed" });
    return response;
  });
  const decode =
    <A, I>(schema: Schema.Codec<A, I>) =>
    (value: unknown) =>
      Schema.decodeUnknownEffect(schema)(value).pipe(
        Effect.mapError((cause) => new BotHqError({ reason: "request_failed", cause })),
      );
  const read = Effect.fn("BotHq.read")(function* (input: BotHqReadInput) {
    if (input.resource !== "bots" && !validId(input.botId))
      return yield* new BotHqError({ reason: "invalid_request" });
    const path =
      input.resource === "bots"
        ? "/bots"
        : `/bots/${input.botId}/${input.resource === "memories" ? "settings" : input.resource}`;
    const response = yield* request("GET", path);
    return yield* response.json.pipe(
      Effect.mapError((cause) => new BotHqError({ reason: "request_failed", cause })),
      Effect.flatMap(decode(BotHqReadResult)),
    );
  });
  const mutate = Effect.fn("BotHq.mutate")(function* (input: BotHqMutation) {
    const operation = mutationRequest(input);
    if (operation === null) return yield* new BotHqError({ reason: "invalid_request" });
    const response = yield* request(
      operation.method,
      operation.path,
      "body" in operation ? operation.body : undefined,
    );
    return yield* response.json.pipe(
      Effect.mapError((cause) => new BotHqError({ reason: "request_failed", cause })),
      Effect.flatMap(decode(BotHqMutationResult)),
    );
  });
  const events = Stream.unwrap(
    request("GET", "/events").pipe(Effect.map((response) => response.stream)),
  ).pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.filter((line) => line.startsWith("data:")),
    Stream.mapEffect((line) =>
      decodeEvent(line.slice(5)).pipe(
        Effect.mapError((cause) => new BotHqError({ reason: "request_failed", cause })),
      ),
    ),
    Stream.mapError((cause) =>
      isBotHqError(cause) ? cause : new BotHqError({ reason: "unavailable", cause }),
    ),
  );
  const screen = Effect.fn("BotHq.screen")(function* (botId: string, mode: "watch" | "control") {
    if (!validId(botId)) return yield* new BotHqError({ reason: "invalid_request" });
    const base = yield* origin;
    const session = yield* signIn();
    return yield* Socket.fromWebSocket(
      Effect.acquireRelease(
        Effect.sync(
          () =>
            new Undici.WebSocket(
              `${base.replace("http:", "ws:")}/api/bots/${botId}/screen?mode=${mode}`,
              { protocols: ["binary"], headers: { cookie: session } },
            ),
        ),
        (socket) => Effect.sync(() => socket.close()),
      ),
    );
  });
  return BotHq.of({ read, mutate, events, screen });
});

export const layer = Layer.effect(BotHq, make);
