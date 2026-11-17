import * as Schema from "effect/Schema";

export const BotHqBot = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  label: Schema.String,
  description: Schema.String,
  instructions: Schema.String,
  avatarColor: Schema.String,
  avatarShape: Schema.String,
  lastPreview: Schema.NullOr(Schema.String),
  unread: Schema.Number,
  generation: Schema.Number,
  model: Schema.NullOr(Schema.String),
  provider: Schema.NullOr(Schema.String),
});
export type BotHqBot = typeof BotHqBot.Type;

export const BotHqRow = Schema.Struct({
  botId: Schema.String,
  generation: Schema.Number,
  seq: Schema.Number,
  updatedSeq: Schema.Number,
  kind: Schema.String,
  createdAt: Schema.Number,
  body: Schema.Struct({
    type: Schema.String,
    role: Schema.optional(Schema.String),
    text: Schema.optional(Schema.String),
    streaming: Schema.optional(Schema.Boolean),
    label: Schema.optional(Schema.String),
    name: Schema.optional(Schema.String),
    summary: Schema.optional(Schema.String),
    status: Schema.optional(Schema.String),
    card: Schema.optional(Schema.String),
    approvalId: Schema.optional(Schema.String),
    title: Schema.optional(Schema.String),
    detail: Schema.optional(Schema.String),
    question: Schema.optional(Schema.String),
    options: Schema.optional(Schema.Array(Schema.String)),
    answer: Schema.optional(Schema.String),
  }),
});
export type BotHqRow = typeof BotHqRow.Type;

export const BotHqLive = Schema.Struct({
  botId: Schema.String,
  isRunning: Schema.Boolean,
  awaiting: Schema.optional(Schema.NullOr(Schema.Unknown)),
});

export const BotHqReadInput = Schema.Struct({
  resource: Schema.Literals(["bots", "rows", "tasks", "routines", "memories"]),
  botId: Schema.optional(Schema.String),
});
export type BotHqReadInput = typeof BotHqReadInput.Type;

export const BotHqReadResult = Schema.Struct({
  bots: Schema.optional(Schema.Array(BotHqBot)),
  live: Schema.optional(Schema.Array(BotHqLive)),
  generation: Schema.optional(Schema.Number),
  rows: Schema.optional(Schema.Array(BotHqRow)),
  tasks: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        title: Schema.String,
        state: Schema.String,
        note: Schema.optional(Schema.NullOr(Schema.String)),
      }),
    ),
  ),
  routines: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        schedule: Schema.String,
        enabled: Schema.Boolean,
        prompt: Schema.optional(Schema.String),
      }),
    ),
  ),
  memories: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        text: Schema.String,
      }),
    ),
  ),
});

const botId = { botId: Schema.String };
export const BotHqMutation = Schema.Union([
  Schema.TaggedStruct("create", {
    name: Schema.String,
    label: Schema.String,
    instructions: Schema.String,
  }),
  Schema.TaggedStruct("send", { ...botId, text: Schema.String }),
  Schema.TaggedStruct("interrupt", botId),
  Schema.TaggedStruct("delete", botId),
  Schema.TaggedStruct("reset", botId),
  Schema.TaggedStruct("fresh", botId),
  Schema.TaggedStruct("approve", {
    approvalId: Schema.String,
    decision: Schema.Literals(["allow", "always", "deny"]),
  }),
  Schema.TaggedStruct("answer", { ...botId, seq: Schema.Number, answer: Schema.String }),
  Schema.TaggedStruct("routine", { routineId: Schema.String, enabled: Schema.Boolean }),
]);
export type BotHqMutation = typeof BotHqMutation.Type;
export const BotHqMutationResult = Schema.Struct({
  bot: Schema.optional(BotHqBot),
  row: Schema.optional(BotHqRow),
  ok: Schema.optional(Schema.Boolean),
});

export const BotHqEvent = Schema.Struct({
  type: Schema.String,
  botId: Schema.optional(Schema.String),
  generation: Schema.optional(Schema.Number),
  rows: Schema.optional(Schema.Array(BotHqRow)),
  bot: Schema.optional(BotHqBot),
  state: Schema.optional(Schema.Unknown),
});
export type BotHqEvent = typeof BotHqEvent.Type;

export class BotHqError extends Schema.TaggedError<BotHqError>()("BotHqError", {
  reason: Schema.Literals([
    "not_configured",
    "unavailable",
    "authentication",
    "invalid_request",
    "request_failed",
  ]),
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    switch (this.reason) {
      case "not_configured":
        return "The bot runtime is not connected on this environment.";
      case "unavailable":
        return "The bot runtime is unavailable. Check that it is running, then retry.";
      case "authentication":
        return "T3 could not sign in to the local bot runtime.";
      case "invalid_request":
        return "This bot request is not valid.";
      case "request_failed":
        return "The bot runtime could not complete this request.";
    }
  }
}
