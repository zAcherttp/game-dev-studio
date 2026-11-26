import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { invokerFor } from "@gds/capability";
import { GameFolder } from "@gds/store";
import { Effect, FileSystem, Path, Schema } from "effect";

import { studioLayer } from "../src/studio-layer.js";
import { capabilities } from "../src/surfaces.js";

const vfxStudio = {
  gates: [],
  id: "vfx",
  layers: [{ id: "core", order: 0, renderKind: "gif", title: "Core" }],
  pack: { files: [] },
  renderKinds: ["gif"],
  renderer: "roblox",
  title: "VFX",
};

const variant = (id: string, parent?: string) => {
  const made = { generator: "test", id, label: id, layer: "core", params: {} };

  return parent === undefined ? made : { ...made, parent };
};

const where = { asset: "fire", layer: "core", studio: "vfx" } as const;

const pickInput = (chosen: string) => ({
  ...where,
  by: "phat",
  note: "",
  variant: chosen,
});

const roundInput = { ...where, axis: "colour", note: "warmer" };

type Invoke = Effect.Success<
  ReturnType<typeof invokerFor<typeof capabilities>>
>;

const inGame = <A, E>(
  body: (
    invoke: Invoke
  ) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>
) =>
  Effect.gen(function* run() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "gds-cli-" });
    const dir = path.join(root, "tools", "devstudio", "studios");

    yield* fs.makeDirectory(dir, { recursive: true });
    yield* fs.writeFileString(
      path.join(dir, "vfx.json"),
      JSON.stringify(vfxStudio)
    );

    const invoke = yield* invokerFor(capabilities).pipe(
      Effect.provide(studioLayer(GameFolder.at(root)))
    );

    return yield* body(invoke).pipe(
      Effect.provide(studioLayer(GameFolder.at(root)))
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const Tagged = Schema.Struct({ _tag: Schema.String });

const tagOf = (outcome: { readonly ok: boolean; readonly error?: unknown }) =>
  outcome.ok ? "ok" : Schema.decodeUnknownSync(Tagged)(outcome.error)._tag;

describe("studio capabilities", () => {
  it.effect(
    "a round keeps its parent: the next variants point at the pick",
    () =>
      inGame((invoke) =>
        Effect.gen(function* keepsParent() {
          yield* invoke("addVariants", {
            ...where,
            variants: [variant("c1"), variant("c2")],
          });
          yield* invoke("pick", pickInput("c1"));
          const request = yield* invoke("round", roundInput);
          yield* invoke("addVariants", {
            ...where,
            variants: [variant("c3", "c1")],
          });

          const asset = yield* invoke("getAsset", {
            asset: "fire",
            studio: "vfx",
          });

          expect(request.ok).toBe(true);
          expect(asset).toMatchObject({
            ok: true,
            value: {
              layers: {
                core: {
                  rounds: [{ axis: "colour", layer: "core", note: "warmer" }],
                  variants: [
                    { id: "c1" },
                    { id: "c2" },
                    { id: "c3", parent: "c1" },
                  ],
                },
              },
              mix: { core: "c1" },
            },
          });
        })
      )
  );

  it.effect("refuses a pick while the layer is making with LayerBusy", () =>
    inGame((invoke) =>
      Effect.gen(function* refusesBusy() {
        yield* invoke("addVariants", { ...where, variants: [variant("c1")] });
        yield* invoke("pick", pickInput("c1"));
        yield* invoke("round", roundInput);

        expect(tagOf(yield* invoke("pick", pickInput("c1")))).toBe("LayerBusy");
      })
    )
  );

  it.effect("refuses a round with no pick with NoPick", () =>
    inGame((invoke) =>
      Effect.gen(function* refusesNoPick() {
        yield* invoke("addVariants", { ...where, variants: [variant("c1")] });

        expect(tagOf(yield* invoke("round", roundInput))).toBe("NoPick");
      })
    )
  );

  it.effect(
    "refuses a pick of a variant that does not exist with UnknownVariant",
    () =>
      inGame((invoke) =>
        Effect.gen(function* refusesUnknownVariant() {
          yield* invoke("addVariants", { ...where, variants: [variant("c1")] });

          expect(tagOf(yield* invoke("pick", pickInput("c9")))).toBe(
            "UnknownVariant"
          );
        })
      )
  );

  it.effect("refuses variants for a layer the studio does not have", () =>
    inGame((invoke) =>
      Effect.gen(function* refusesUnknownLayer() {
        expect(
          tagOf(
            yield* invoke("addVariants", {
              ...where,
              layer: "smoke",
              variants: [{ ...variant("x1"), layer: "smoke" }],
            })
          )
        ).toBe("UnknownLayer");
      })
    )
  );

  it.effect(
    "reports the unconnected renderer and check as adapter failures",
    () =>
      inGame((invoke) =>
        Effect.gen(function* reportsAdapters() {
          yield* invoke("addVariants", { ...where, variants: [variant("c1")] });

          expect(
            tagOf(yield* invoke("render", { ...where, variant: "c1" }))
          ).toBe("AdapterFailed");
          expect(
            tagOf(yield* invoke("openCheck", { asset: "fire", studio: "vfx" }))
          ).toBe("AdapterFailed");
        })
      )
  );
});

const Command = Schema.Union([
  Schema.Struct({
    count: Schema.Literals([0, 1, 2]),
    kind: Schema.Literal("add"),
  }),
  Schema.Struct({
    index: Schema.Literals([0, 1, 2]),
    kind: Schema.Literal("pick"),
  }),
  Schema.Struct({ kind: Schema.Literal("round") }),
]);

interface Model {
  readonly exists: boolean;
  readonly making: boolean;
  readonly picked: boolean;
  readonly variants: number;
}

const expected = (
  model: Model,
  command: typeof Command.Type
): readonly [string, Model] => {
  if (command.kind === "add") {
    return [
      "ok",
      {
        ...model,
        exists: true,
        making: false,
        variants: model.variants + command.count,
      },
    ];
  }

  if (!model.exists) {
    return ["UnknownAsset", model];
  }

  if (command.kind === "pick") {
    if (model.making) {
      return ["LayerBusy", model];
    }

    return command.index < model.variants
      ? ["ok", { ...model, picked: true }]
      : ["UnknownVariant", model];
  }

  return model.picked ? ["ok", { ...model, making: true }] : ["NoPick", model];
};

const callFor = (
  invoke: Invoke,
  command: typeof Command.Type,
  made: number
) => {
  if (command.kind === "add") {
    return invoke("addVariants", {
      ...where,
      variants: Array.from({ length: command.count }, (_, offset) =>
        variant(`v${made + offset}`)
      ),
    });
  }

  if (command.kind === "pick") {
    return invoke("pick", pickInput(`v${command.index}`));
  }

  return invoke("round", roundInput);
};

describe("layer lifecycle model", () => {
  it.effect.prop(
    "every generated history of adds, picks and rounds matches the lifecycle rules",
    { commands: Schema.Array(Command).check(Schema.isBetweenLength(8, 16)) },
    ({ commands }) =>
      inGame((invoke) =>
        Effect.gen(function* followsModel() {
          let model: Model = {
            exists: false,
            making: false,
            picked: false,
            variants: 0,
          };

          for (const command of commands) {
            const [tag, after] = expected(model, command);
            const outcome = yield* callFor(invoke, command, model.variants);

            expect(tagOf(outcome)).toBe(tag);
            model = after;
          }
        })
      ),
    { arbitrary: { runs: 100 } }
  );
});
