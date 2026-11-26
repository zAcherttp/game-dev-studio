import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Renderer } from "@gds/model";
import { Effect, Layer, Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import { FileSystem } from "effect/FileSystem";

import {
  ShotCameraFile,
  callContext,
  parseCall,
  placeProject,
  serverCallsLuau,
  shotCameras,
  shotRenderer,
  shotStudio,
} from "../src/index.js";

const Name = Schema.String.check(Schema.isPattern(/^[A-Za-z_]\w{0,8}$/u));

const Id = Schema.String.check(Schema.isPattern(/^[a-z]{1,6}$/u));

const context = { params: {}, seed: 1, take: {} };

const variant = (layer: string, id: string) => ({
  generator: "world",
  id,
  label: id,
  layer,
  params: { look: id },
});

describe("dev calls", () => {
  it.prop(
    "read back every JSON argument they were written with",
    {
      args: Arbitrary.schema(Schema.Array(Schema.Json)),
      fn: Arbitrary.schema(Name),
      module: Arbitrary.schema(Name),
    },
    ({ args, fn, module }) => {
      const text = `${module}.${fn}(${args.map((arg) => JSON.stringify(arg)).join(", ")})`;
      const call = parseCall(text, context);

      expect(Option.isSome(call)).toBe(true);
      expect(JSON.stringify(Option.getOrUndefined(call))).toBe(
        JSON.stringify({ args, fn, module })
      );
    }
  );

  it.prop(
    "give $take the variant drawn on its own layer and the mix's pick on every other",
    {
      layers: Arbitrary.schema(Schema.Array(Id).check(Schema.isMinLength(2))),
      picked: Arbitrary.schema(Id),
    },
    ({ layers, picked }) => {
      const [own = "a", ...others] = [...new Set(layers)];
      const mix = Object.fromEntries(layers.map((layer) => [layer, "mix"]));

      const take = callContext({
        asset: "village",
        layer: own,
        mix,
        studio: "world",
        variant: variant(own, picked),
      });

      const read = (layer: string) =>
        Option.getOrUndefined(parseCall(`Look.set($take.${layer})`, take))
          ?.args[0];

      expect(read(own)).toBe(picked);

      for (const layer of others) {
        expect(read(layer)).toBe("mix");
      }

      const whole = callContext({
        asset: "village",
        layer: own,
        mix,
        studio: "world",
        variant: variant(own, picked),
        whole: true,
      });

      expect(
        Option.getOrUndefined(parseCall(`Look.set($take.${own})`, whole))
          ?.args[0]
      ).toBe("mix");
    }
  );

  it("pass a missing token as nil and refuse what is not a call", () => {
    expect(
      Option.getOrUndefined(parseCall("Look.set($params.none, $seed)", context))
        ?.args
    ).toEqual([null, 1]);
    expect(Option.isNone(parseCall("not a call", context))).toBe(true);
    expect(Option.isNone(parseCall("Look.set(oops)", context))).toBe(true);
  });

  it("keep an argument holding a closing long bracket inside the Luau string", () => {
    const code = serverCallsLuau([
      { args: ["]]", "]=]"], fn: "set", module: "Look" },
    ]);

    expect(code).toContain('JSONDecode([==[[{"args":[{"v":"]]"},{"v":"]=]"}]');
  });
});

const Camera = Schema.Struct({
  id: Id,
  placed: Schema.Boolean,
});

describe("shot cameras", () => {
  it.effect.prop(
    "are ready only when every named camera has world studs, and name each one that waits",
    {
      cameras: Arbitrary.schema(
        Schema.Array(Camera).check(Schema.isMinLength(1))
      ),
    },
    ({ cameras }) =>
      Effect.gen(function* ready() {
        const unique = [
          ...new Map(cameras.map((each) => [each.id, each])).values(),
        ];

        const file = yield* Schema.decodeEffect(ShotCameraFile)({
          cameras: unique.map(({ id, placed }) =>
            placed
              ? { fov: 50, id, lookAt: [0, 0, 1], position: [0, 5, 0] }
              : { id, pending: "asked" }
          ),
          layers: { mood: unique.map(({ id }) => id) },
        });

        const shots = yield* shotCameras(file, "mood");
        const waiting = unique.filter(({ placed }) => !placed);

        expect(shots.kind).toBe(waiting.length === 0 ? "ready" : "pending");
        expect(shots.cameras.map(({ id }) => id)).toEqual(
          unique.flatMap(({ id, placed }) => (placed ? [id] : []))
        );

        if (shots.kind === "pending") {
          for (const { id } of waiting) {
            expect(shots.reason).toContain(`${id} (asked)`);
          }
        }
      })
  );

  it.effect("fail typed on a camera the file does not hold", () =>
    Effect.gen(function* unknown() {
      const file = yield* Schema.decodeEffect(ShotCameraFile)({
        cameras: [{ id: "well", pending: "asked" }],
        layers: { mood: ["well", "pier"] },
      });

      const problem = yield* shotCameras(file, "mood").pipe(Effect.flip);

      expect(problem).toMatchObject({ camera: "pier", known: ["well"] });
    })
  );

  it.effect(
    "treat a camera framed on a landmark as not placed for Studio",
    () =>
      Effect.gen(function* framed() {
        const file = yield* Schema.decodeEffect(ShotCameraFile)({
          cameras: [
            {
              frame: { anchor: "village.centre" },
              id: "aerial",
              lookAt: [0, 0, 0],
              position: [1, 1, 1],
            },
          ],
          layers: { mood: ["aerial"] },
        });

        const shots = yield* shotCameras(file, "mood");

        expect(shots.kind).toBe("pending");
      })
  );
});

describe("shot place project", () => {
  it("roots each path in the scratch tree when it holds it, else in the game, and drops the serve port", () => {
    const placed = placeProject(
      {
        name: "fresh",
        servePort: 34_990,
        tree: {
          Packages: { $path: "Packages" },
          Shared: {
            $path: "src/shared",
            Look: { $path: { optional: "src/features/Look/Shared" } },
          },
        },
      },
      {
        game: "G:",
        has: (relative) => relative.startsWith("src/"),
        join: (root, relative) => `${root}\\${relative}`,
        tree: "T:",
      }
    );

    expect(placed).toEqual({
      name: "fresh",
      tree: {
        Packages: { $path: "G:/Packages" },
        Shared: {
          $path: "T:/src/shared",
          Look: { $path: { optional: "T:/src/features/Look/Shared" } },
        },
      },
    });
  });
});

const renderMood = (cameras: typeof ShotCameraFile.Encoded, slot?: string) =>
  Effect.gen(function* drawMoodRender() {
    const fs = yield* FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const camerasPath = `${dir}/cameras.json`;

    yield* fs.writeFileString(camerasPath, JSON.stringify(cameras));

    const shots = shotRenderer.pipe(
      Layer.provide(
        shotStudio({
          apply: () => Effect.succeed({ changed: [] }),
          cache: dir,
          cameras: camerasPath,
          gameRoot: dir,
          gates: [],
          project: "fresh.project.json",
          python: "unused",
          quality: 21,
          shotLayer: "mood",
          slot,
        })
      )
    );

    return yield* Effect.gen(function* drawMood() {
      const renderer = yield* Renderer;

      return yield* renderer.render({
        asset: "village",
        layer: "mood",
        mix: { mood: "Day" },
        studio: "world",
        variant: variant("mood", "Twilight"),
      });
    }).pipe(Effect.provide(shots));
  }).pipe(Effect.scoped);

describe("roblox.shot renderer", () => {
  it.layer(NodeServices.layer)((layered) => {
    layered.effect(
      "waits, without opening Studio, while a camera is unplaced",
      () =>
        Effect.gen(function* unplaced() {
          const render = yield* renderMood(
            {
              cameras: [{ id: "studio.well", pending: "asked World Art" }],
              layers: { mood: ["studio.well"] },
            },
            "2"
          );

          expect(render.pending).toContain("studio.well (asked World Art)");
          expect(render.views).toBeUndefined();
        })
    );

    layered.effect("waits for a Studio slot once every camera is placed", () =>
      Effect.gen(function* noSlot() {
        const render = yield* renderMood({
          cameras: [
            {
              fov: 60,
              id: "studio.well",
              lookAt: [0, 30, 0],
              position: [40, 50, 40],
            },
          ],
          layers: { mood: ["studio.well"] },
        });

        expect(render.pending).toContain("no Studio slot");
      })
    );
  });
});
