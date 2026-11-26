import { fileURLToPath } from "node:url";

import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { invokerFor } from "@gds/capability";
import { AdapterFailed, Apply, Asset } from "@gds/model";
import type { StudioDef } from "@gds/model";
import { GameFolder } from "@gds/store";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";

import { studioLayer } from "../src/studio-layer.js";
import { capabilities } from "../src/surfaces.js";

const vfxStudio: typeof StudioDef.Encoded = {
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

const kitVariant = (layer: string, id: string) => ({ ...variant(id), layer });

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
  ) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
  extra: Layer.Layer<never> = Layer.empty,
  studio: typeof StudioDef.Encoded = vfxStudio
) =>
  Effect.gen(function* run() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "gds-cli-" });
    const dir = path.join(root, "tools", "devstudio", "studios");

    yield* fs.makeDirectory(dir, { recursive: true });
    yield* fs.writeFileString(
      path.join(dir, "vfx.json"),
      JSON.stringify(studio)
    );

    const layer = Layer.merge(studioLayer(GameFolder.at(root)), extra);
    const invoke = yield* invokerFor(capabilities).pipe(Effect.provide(layer));

    return yield* body(invoke).pipe(Effect.provide(layer));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const Tagged = Schema.Struct({ _tag: Schema.String });

const failingApply = Layer.succeed(
  Apply,
  Apply.of({
    apply: () =>
      Effect.fail(
        new AdapterFailed({
          adapter: "apply",
          message: "Config row not written",
        })
      ),
  })
);

const tagOf = (outcome: { readonly ok: boolean; readonly error?: unknown }) =>
  outcome.ok ? "ok" : Schema.decodeUnknownSync(Tagged)(outcome.error)._tag;

describe("studio capabilities", () => {
  it.effect(
    "a round keeps its parent: the next variants point at the pick unless they name their own",
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
            variants: [variant("c3", "c2"), variant("c4")],
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
                    { id: "c3", parent: "c2" },
                    { id: "c4", parent: "c1" },
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

  it.effect(
    "a pick whose Apply fails fails the pick and leaves the store untouched",
    () =>
      inGame(
        (invoke) =>
          Effect.gen(function* applyFails() {
            yield* invoke("addVariants", {
              ...where,
              variants: [variant("c1")],
            });

            const before = yield* invoke("getAsset", {
              asset: "fire",
              studio: "vfx",
            });

            const picked = yield* invoke("pick", pickInput("c1"));

            const after = yield* invoke("getAsset", {
              asset: "fire",
              studio: "vfx",
            });

            expect(tagOf(picked)).toBe("AdapterFailed");
            expect(after).toEqual(before);
          }),
        failingApply
      )
  );

  it.effect("draws each layer through its own renderer over the studio's", () =>
    inGame(
      (invoke) =>
        Effect.gen(function* layerRenderer() {
          yield* invoke("addVariants", { ...where, variants: [variant("c1")] });

          const drawn = yield* invoke("render", { ...where, variant: "c1" });

          expect(tagOf(drawn)).toBe("AdapterFailed");
          expect(JSON.stringify(drawn)).toContain("command:refloop");
          expect(JSON.stringify(drawn)).toContain("for layer core");
        }),
      Layer.empty,
      {
        ...vfxStudio,
        layers: [
          {
            id: "core",
            order: 0,
            renderKind: "gif",
            renderer: "command:refloop",
            title: "Core",
          },
        ],
      }
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

  it.effect(
    "an asset on the studio's layers refuses a layer the studio does not have",
    () =>
      inGame((invoke) =>
        Effect.gen(function* refusesUnknownLayer() {
          yield* invoke("addVariants", { ...where, variants: [variant("c1")] });

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

  it.effect("a kit's own layers win over the studio's default layers", () =>
    inGame((invoke) =>
      Effect.gen(function* kitLayersWin() {
        const kit = { asset: "kit", studio: "vfx" } as const;

        const first = yield* invoke("addVariants", {
          ...kit,
          layer: "Anticipation",
          variants: [kitVariant("Anticipation", "a1")],
        });

        const second = yield* invoke("addVariants", {
          ...kit,
          layer: "Streaks",
          variants: [kitVariant("Streaks", "s1")],
        });

        const asset = yield* invoke("getAsset", kit);
        const layers = yield* invoke("layersOf", kit);

        const defaults = yield* invoke("layersOf", {
          asset: "fire",
          studio: "vfx",
        });

        expect([first.ok, second.ok]).toEqual([true, true]);
        expect(layers).toMatchObject({
          ok: true,
          value: {
            layers: [
              { id: "Anticipation", order: 0, title: "Anticipation" },
              { id: "Streaks", order: 1, title: "Streaks" },
            ],
          },
        });
        expect(tagOf(defaults)).toBe("UnknownAsset");
        expect(asset).toMatchObject({
          ok: true,
          value: {
            layers: {
              Anticipation: { variants: [{ id: "a1" }] },
              Streaks: { variants: [{ id: "s1" }] },
            },
          },
        });
        expect(asset).not.toHaveProperty("value.layers.core");
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

const commandScript = fileURLToPath(
  new URL("fixtures/command-studio.ts", import.meta.url)
);

const run = (verb: string): [string, ...string[]] => [
  process.execPath,
  commandScript,
  verb,
];

const commandStudio: typeof StudioDef.Encoded = {
  commands: {
    assets: run("assets"),
    render: run("render"),
    takes: run("takes"),
  },
  gates: [
    {
      id: "fights",
      json: "fights",
      pass: { op: "eq", value: 0 },
      run: run("gate"),
      title: "Coplanar fights",
      where: "variant",
    },
  ],
  id: "vfx",
  layers: [
    {
      id: "core",
      order: 0,
      renderKind: "image",
      renderer: "command:render",
      title: "Core",
    },
  ],
  pack: { files: [] },
  renderKinds: ["image"],
  renderer: "elsewhere",
  title: "Props",
};

describe("command studio", () => {
  it.effect(
    "lists a command studio's takes and shows each rendered variant's gates on the asset",
    () =>
      inGame(
        (invoke) =>
          Effect.gen(function* commandRound() {
            const stool = { asset: "stool", layer: "core", studio: "vfx" };
            const assets = yield* invoke("listAssets", { studio: "vfx" });

            const passing = yield* invoke("render", {
              ...stool,
              variant: "t1",
            });

            const failing = yield* invoke("render", {
              ...stool,
              variant: "t2",
            });

            const asset = yield* invoke("getAsset", {
              asset: "stool",
              studio: "vfx",
            });

            expect(assets).toMatchObject({
              ok: true,
              value: { assets: [{ id: "stool", title: "Stool" }] },
            });
            expect([passing.ok, failing.ok]).toEqual([true, true]);
            expect(asset).toMatchObject({
              ok: true,
              value: {
                layers: {
                  core: {
                    variants: [
                      {
                        gates: [{ id: "fights", ok: true, value: 0 }],
                        id: "t1",
                      },
                      {
                        gates: [{ id: "fights", ok: false, value: 2 }],
                        id: "t2",
                      },
                    ],
                  },
                },
              },
            });
          }),
        Layer.empty,
        commandStudio
      )
  );
});

describe("command studio mix", () => {
  it.effect(
    "draws the whole mix through the studio's renderer without running any variant gate",
    () =>
      inGame(
        (invoke) =>
          Effect.gen(function* drawMix() {
            const stool = { asset: "stool", studio: "vfx" };

            const picked = yield* invoke("pick", {
              ...stool,
              by: "phat",
              layer: "core",
              note: "",
              variant: "t2",
            });

            const mix = yield* invoke("renderMix", stool);
            const asset = yield* invoke("getAsset", stool);

            expect(picked.ok).toBe(true);
            expect(mix).toMatchObject({ ok: true, value: { kind: "image" } });
            expect(asset).toMatchObject({
              ok: true,
              value: { mix: { core: "t2" } },
            });

            const stored = yield* Schema.decodeUnknownEffect(Asset)(
              asset.ok ? asset.value : undefined
            );

            expect(
              Object.values(stored.layers).flatMap(({ variants }) =>
                variants.flatMap(({ gates }) => gates ?? [])
              )
            ).toEqual([]);
          }),
        Layer.empty,
        commandStudio
      )
  );
});

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
