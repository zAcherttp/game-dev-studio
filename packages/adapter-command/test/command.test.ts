import { fileURLToPath } from "node:url";

import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import type { GateDef, StudioDef } from "@gds/model";
import { Duration, Effect, Layer, Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

import {
  CommandConfig,
  GateLedger,
  commandStudio,
  judge,
  readPath,
  runGates,
} from "../src/index.js";

const fixture = fileURLToPath(new URL("fixtures/studio.ts", import.meta.url));

const verb = (name: string): [string, ...string[]] => [
  process.execPath,
  fixture,
  name,
];

const gate = (
  id: string,
  extra: Partial<typeof GateDef.Type> = {}
): typeof GateDef.Type => ({
  id,
  json: "figures.problems",
  pass: { op: "eq", value: 0 },
  run: verb("gate"),
  title: id,
  where: "variant",
  ...extra,
});

const studio = (
  commands: Readonly<Record<string, readonly [string, ...string[]]>>,
  gates: readonly (typeof GateDef.Type)[] = []
): typeof StudioDef.Type => ({
  commands,
  gates,
  id: "props",
  layers: [
    {
      id: "frame",
      order: 0,
      renderKind: "image",
      renderer: "command:render",
      title: "Frame",
    },
    { id: "paint", order: 1, renderKind: "image", title: "Paint" },
  ],
  pack: { files: [] },
  renderKinds: ["image"],
  renderer: "elsewhere",
  title: "Props",
});

const variant = (params: Readonly<Record<string, number>> = {}) => ({
  generator: "fixture",
  id: "frame-1",
  label: "one",
  layer: "frame",
  params,
});

const request = (params: Readonly<Record<string, number>> = {}) => ({
  asset: "Kit/Stool",
  layer: "frame",
  mix: {},
  studio: "props",
  variant: variant(params),
});

const inGame = <A, E>(
  body: (
    root: string
  ) => Effect.Effect<
    A,
    E,
    CommandConfig | GateLedger | NodeServices.NodeServices
  >,
  timeout = Duration.seconds(30)
) =>
  Effect.gen(function* run() {
    const fs = yield* FileSystem;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "gds-command-" });
    const config = CommandConfig.layer(Effect.succeed({ root, timeout }));

    return yield* body(root).pipe(
      Effect.provide(Layer.provideMerge(GateLedger.layer, config))
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const result = (ok: boolean) => ({
  id: "problems",
  note: "",
  ok,
  value: ok ? 0 : 3,
});

describe("studio commands", () => {
  it.effect("lists assets and takes from the studio's commands", () =>
    inGame(() =>
      Effect.gen(function* listsAssets() {
        const { source } = yield* commandStudio(
          studio({ assets: verb("assets"), takes: verb("takes") })
        );

        expect(yield* source.listAssets("props")).toEqual([
          { id: "Kit/Stool", title: "Stool" },
          { id: "village", title: "Village" },
        ]);
        expect(yield* source.takesOf("props", "Kit/Stool", "paint")).toEqual([
          {
            generator: "fixture",
            id: "paint-1",
            label: "one",
            layer: "paint",
            params: { seed: 1 },
          },
        ]);
        expect(yield* source.layersOf("props", "Kit/Stool")).toHaveLength(2);
        expect(
          (yield* Effect.flip(source.takesOf("props", "Kit/Stool", "mood")))
            ._tag
        ).toBe("UnknownLayer");
        expect((yield* Effect.flip(source.listAssets("vfx")))._tag).toBe(
          "UnknownStudio"
        );
      })
    )
  );

  it.effect(
    "renders through command:<verb> in the game checkout and roots the printed paths there",
    () =>
      inGame((root) =>
        Effect.gen(function* renders() {
          const fs = yield* FileSystem;
          const path = yield* Path;

          const { renderer } = yield* commandStudio(
            studio({ render: verb("render") })
          );

          const drawn = yield* renderer.render(request());
          const expected = path.join(root, "out", "frame-1.png");

          expect(drawn).toEqual({
            kind: "image",
            ms: 1,
            path: expected,
            views: [{ camera: "front", path: expected }],
          });
          expect(yield* fs.exists(expected)).toBe(true);

          const other = yield* Effect.flip(
            renderer.render({ ...request(), layer: "paint" })
          );

          expect(other.message).toContain('renderer "elsewhere"');
        })
      )
  );

  it.effect(
    "applies a pick by command and changes nothing for a studio without one",
    () =>
      inGame(() =>
        Effect.gen(function* applies() {
          const withApply = yield* commandStudio(
            studio({ apply: verb("apply") })
          );

          const without = yield* commandStudio(studio({}));

          const where = {
            asset: "Kit/Stool",
            layer: "frame",
            studio: "props",
            variant: variant(),
          };

          expect(yield* withApply.apply.apply(where)).toEqual({
            changed: ["config/frame-1.luau"],
          });
          expect(yield* without.apply.apply(where)).toEqual({ changed: [] });
        })
      )
  );

  it.effect(
    "fails typed on a non-zero exit, bad JSON and a missing command",
    () =>
      inGame(() =>
        Effect.gen(function* failsTyped() {
          const { renderer, source } = yield* commandStudio(
            studio({ assets: verb("fail"), render: verb("bad") })
          );

          const exited = yield* Effect.flip(source.listAssets("props"));
          const bad = yield* Effect.flip(renderer.render(request()));

          const missing = yield* Effect.flip(
            source.takesOf("props", "Kit/Stool", "frame")
          );

          expect(exited._tag).toBe("AdapterFailed");
          expect(exited.message).toContain("exited 3");
          expect(exited.message).toContain("no such seed");
          expect(bad._tag).toBe("AdapterFailed");
          expect(bad.message).toContain("no json here");
          expect(missing._tag).toBe("AdapterFailed");
          expect(missing.message).toContain('no "takes" command');
        })
      )
  );

  it.live("stops a command that runs past the timeout and fails typed", () =>
    inGame(
      () =>
        Effect.gen(function* stopsSlow() {
          const { source } = yield* commandStudio(
            studio({ takes: verb("slow") })
          );

          const slow = yield* Effect.flip(
            source.takesOf("props", "Kit/Stool", "frame")
          );

          expect(slow._tag).toBe("AdapterFailed");
          expect(slow.message).toContain("was stopped");
        }),
      Duration.seconds(4)
    )
  );
});

describe("variant gates", () => {
  const drawn = { kind: "image" as const, ms: 1, path: "out/frame-1.png" };

  it.effect(
    "runs the variant gates that apply to the layer and judges each value",
    () =>
      inGame(() =>
        Effect.gen(function* judges() {
          const def = studio({}, [
            gate("problems"),
            {
              id: "exit",
              pass: { op: "lt", value: 1 },
              run: verb("exit"),
              title: "exit",
              where: "variant",
            },
            gate("paint-only", { layers: ["paint"] }),
            gate("in-engine", { where: "check" }),
          ]);

          const clean = yield* runGates(def, request(), drawn);

          const dirty = yield* runGates(
            def,
            request({ code: 2, problems: 4 }),
            drawn
          );

          expect(clean.map(({ id, ok, value }) => ({ id, ok, value }))).toEqual(
            [
              { id: "problems", ok: true, value: 0 },
              { id: "exit", ok: true, value: 0 },
            ]
          );
          expect(dirty.map(({ id, ok, value }) => ({ id, ok, value }))).toEqual(
            [
              { id: "problems", ok: false, value: 4 },
              { id: "exit", ok: false, value: 2 },
            ]
          );
          expect(dirty[0]?.note).toContain("fails eq 0");
        })
      )
  );

  it.effect(
    "fails typed when a gate's path is missing or its cwd leaves the checkout",
    () =>
      inGame(() =>
        Effect.gen(function* gateFailures() {
          const missing = yield* Effect.flip(
            runGates(
              studio({}, [gate("lost", { json: "figures.nothing" })]),
              request(),
              drawn
            )
          );

          const outside = yield* Effect.flip(
            runGates(
              studio({}, [gate("away", { cwd: "../elsewhere" })]),
              request(),
              drawn
            )
          );

          expect(missing.message).toContain("without figures.nothing");
          expect(outside.message).toContain("outside the game checkout");
        })
      )
  );

  it.effect(
    "keeps the latest gate results per variant and attaches them to the asset",
    () =>
      inGame(() =>
        Effect.gen(function* ledger() {
          const gates = yield* GateLedger;

          const where = {
            asset: "Kit/Stool",
            layer: "frame",
            studio: "props",
            variant: "frame-1",
          };

          yield* gates.record(where, [result(false)]);
          yield* gates.record(where, [result(true)]);

          const asset = yield* gates.attach({
            id: "Kit/Stool",
            layers: {
              frame: {
                picks: [],
                variants: [variant(), { ...variant(), id: "frame-2" }],
              },
            },
            mix: {},
            studio: "props",
            title: "Stool",
          });

          expect(
            asset.layers.frame?.variants.map((entry) => entry.gates)
          ).toEqual([[result(true)], undefined]);
        })
      )
  );
});

const Key = Schema.Literals(["a", "b", "c"]);

describe("gate rules", () => {
  it.prop(
    "compares a number with the pass value the way the op names",
    {
      left: Arbitrary.schema(Schema.Finite),
      right: Arbitrary.schema(Schema.Finite),
    },
    ({ left, right }) => {
      expect(judge({ op: "lt", value: right }, left)).toBe(left < right);
      expect(judge({ op: "le", value: right }, left)).toBe(left <= right);
      expect(judge({ op: "gt", value: right }, left)).toBe(left > right);
      expect(judge({ op: "ge", value: right }, left)).toBe(left >= right);
      expect(judge({ op: "lt", value: right }, String(left))).toBe(false);
    }
  );

  it.prop(
    "eq holds for a value against itself, and truthy follows JSON truthiness",
    { value: Arbitrary.schema(Schema.Json) },
    ({ value }) => {
      expect(judge({ op: "eq", value }, value)).toBe(true);
      expect(judge({ truthy: true }, value)).toBe(
        !(value === null || value === false || value === 0 || value === "")
      );
    }
  );

  it.prop(
    "reads back a value at the dotted path it was put under, and nothing past it",
    {
      keys: Arbitrary.schema(Schema.Array(Key)),
      value: Arbitrary.schema(Schema.Json),
    },
    ({ keys, value }) => {
      let nested: Schema.Json = value;

      for (const key of keys.toReversed()) {
        nested = { [key]: nested };
      }

      expect(readPath(nested, keys.join("."))).toEqual(Option.some(value));
      expect(
        Option.isNone(readPath(nested, [...keys, "a", "b"].join(".")))
      ).toBe(Option.isNone(readPath(value, "a.b")));
    }
  );
});
