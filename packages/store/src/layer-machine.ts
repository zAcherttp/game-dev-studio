import { watchActor } from "@gds/capability/actor-watch";
import { LayerBusy, NoPick, UnknownVariant } from "@gds/model";
import type { AssetLayer } from "@gds/model";
import { createEffectActor, join, send, setupEffect } from "@xstate/effect";
import { Data, Effect, Schema } from "effect";
import { types } from "xstate";

export const LayerState = Schema.Literals([
  "empty",
  "making",
  "ready",
  "picked",
  "round",
]);

type StateName = typeof LayerState.Type;

export const LayerFacts = Schema.Struct({
  asset: Schema.String,
  layer: Schema.String,
  making: Schema.Boolean,
  picked: Schema.Boolean,
  roundSincePick: Schema.Boolean,
  studio: Schema.String,
  variants: Schema.Array(Schema.String),
});

type Facts = typeof LayerFacts.Type;

export type LayerRefusal = LayerBusy | NoPick | UnknownVariant;

export type LayerOutcome = Data.TaggedEnum<{
  Moved: { readonly from: StateName; readonly to: StateName };
  Refused: { readonly error: LayerRefusal };
}>;

export const layerOutcome = Data.taggedEnum<LayerOutcome>();

export const layerEvents = {
  ADD_VARIANTS: Schema.Struct({ variants: Schema.Array(Schema.String) }),
  PICK: Schema.Struct({ variant: Schema.String }),
  ROUND: Schema.Struct({}),
};

export type LayerEvent =
  | { readonly type: "ADD_VARIANTS"; readonly variants: readonly string[] }
  | { readonly type: "PICK"; readonly variant: string }
  | { readonly type: "ROUND" };

export const factsOf = (
  where: {
    readonly studio: string;
    readonly asset: string;
    readonly layer: string;
  },
  entry: typeof AssetLayer.Type | undefined
): Facts => {
  const lastPick = entry?.picks.at(-1);
  const lastRound = entry?.rounds?.at(-1);

  return {
    ...where,
    making: entry?.making !== undefined,
    picked: lastPick !== undefined,
    roundSincePick:
      lastPick !== undefined &&
      lastRound !== undefined &&
      lastRound.at > lastPick.at,
    variants: (entry?.variants ?? []).map(({ id }) => id),
  };
};

export const stateOf = (facts: Facts): StateName => {
  if (facts.making) {
    return "making";
  }

  if (facts.variants.length === 0) {
    return "empty";
  }

  if (!facts.picked || facts.roundSincePick) {
    return "ready";
  }

  return "picked";
};

interface LayerContext {
  readonly facts: Facts;
  readonly from: StateName;
  readonly outcome: LayerOutcome | undefined;
}

const settle = (context: LayerContext, outcome: LayerOutcome) => ({
  context: { ...context, outcome },
  target: "settled" as const,
});

const moveTo = (context: LayerContext, to: StateName) =>
  settle(context, layerOutcome.Moved({ from: context.from, to }));

const refuse = (context: LayerContext, error: LayerRefusal) =>
  settle(context, layerOutcome.Refused({ error }));

const where = ({ facts }: LayerContext) => ({
  asset: facts.asset,
  layer: facts.layer,
  studio: facts.studio,
});

const addVariants = (context: LayerContext, variants: readonly string[]) =>
  moveTo(
    context,
    variants.length === 0 && context.from === "empty" ? "empty" : "ready"
  );

const pickVariant = (context: LayerContext, variant: string) =>
  context.facts.variants.includes(variant)
    ? moveTo(context, "picked")
    : refuse(context, new UnknownVariant({ ...where(context), variant }));

const startRound = (context: LayerContext) =>
  context.facts.picked
    ? {
        context: {
          ...context,
          outcome: layerOutcome.Moved({ from: context.from, to: "making" }),
        },
        target: "round" as const,
      }
    : refuse(context, new NoPick(where(context)));

export const layerMachine = setupEffect({
  schemas: {
    context: types<LayerContext>(),
    events: layerEvents,
    input: LayerFacts,
  },
}).createMachine({
  context: ({ input }) => ({
    facts: input,
    from: stateOf(input),
    outcome: undefined,
  }),
  initial: "hydrating",
  output: ({ context }) => context.outcome,
  states: {
    empty: {
      on: {
        ADD_VARIANTS: ({ context, event }) =>
          addVariants(context, event.variants),
        PICK: ({ context, event }) => pickVariant(context, event.variant),
        ROUND: ({ context }) => refuse(context, new NoPick(where(context))),
      },
    },
    hydrating: {
      always: ({ context }) => ({ target: context.from }),
    },
    making: {
      on: {
        ADD_VARIANTS: ({ context, event }) =>
          addVariants(context, event.variants),
        PICK: ({ context }) => refuse(context, new LayerBusy(where(context))),
        ROUND: ({ context }) => startRound(context),
      },
    },
    picked: {
      on: {
        ADD_VARIANTS: ({ context, event }) =>
          addVariants(context, event.variants),
        PICK: ({ context, event }) => pickVariant(context, event.variant),
        ROUND: ({ context }) => startRound(context),
      },
    },
    ready: {
      on: {
        ADD_VARIANTS: ({ context, event }) =>
          addVariants(context, event.variants),
        PICK: ({ context, event }) => pickVariant(context, event.variant),
        ROUND: ({ context }) => startRound(context),
      },
    },
    round: {
      always: { target: "settled" },
    },
    settled: { type: "final" },
  },
});

const moveLayer = Effect.fn("moveLayer")(function* moveLayer(
  facts: Facts,
  event: LayerEvent
) {
  const actor = yield* createEffectActor(layerMachine, { input: facts });
  yield* watchActor("layerMachine", actor);
  yield* send(actor, event);
  // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- join exposes the machine's unknown failure channel; the layer machine has no actors, so a failure is a defect.
  const outcome = yield* join(actor).pipe(Effect.orDie);

  if (outcome === undefined) {
    return yield* Effect.die(
      new Error("The layer machine settled without an outcome.")
    );
  }

  return yield* layerOutcome.$match(outcome, {
    Moved: ({ to }) => Effect.succeed(to),
    Refused: ({ error }) => Effect.fail(error),
  });
}, Effect.scoped);

const impossible = (error: LayerRefusal) =>
  Effect.die(
    new Error(
      `The layer machine refused a move with ${error._tag}, which that move cannot cause.`
    )
  );

export const addToLayer = (facts: Facts, variants: readonly string[]) =>
  moveLayer(facts, { type: "ADD_VARIANTS", variants }).pipe(
    Effect.catchTag(["LayerBusy", "NoPick", "UnknownVariant"], impossible)
  );

export const pickOnLayer = (facts: Facts, variant: string) =>
  moveLayer(facts, { type: "PICK", variant }).pipe(
    Effect.catchTag("NoPick", impossible)
  );

export const roundOnLayer = (facts: Facts) =>
  moveLayer(facts, { type: "ROUND" }).pipe(
    Effect.catchTag(["LayerBusy", "UnknownVariant"], impossible)
  );
