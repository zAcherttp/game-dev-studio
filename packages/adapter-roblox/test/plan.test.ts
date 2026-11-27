import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import { layerWebCrypto } from "effect/crypto/Digest";

import {
  CameraSet,
  PLAN_RENDERER_VERSION,
  PlanBody,
  PlanPart,
  UnknownLandmark,
  decodePlan,
  placeCameras,
  planKey,
  planKeyText,
  projectMounts,
} from "../src/index.js";

const Point = Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite]);

const Landmarks = Schema.Record(Schema.String, Point);

const PlanValue = Schema.Struct({
  landmarks: Landmarks,
  parts: Schema.Array(PlanPart).check(Schema.isMinLength(1)),
});

const cameras = Schema.decodeSync(CameraSet)({
  cameras: [
    {
      eye: { along: ["arrival", "gate"], at: "arrival", move: [0, 9, -4] },
      figure: { along: ["arrival", "gate"], at: "arrival", move: [0, 0, 10] },
      fov: 70,
      id: "arrival",
      target: { along: ["arrival", "gate"], at: "arrival", move: [0, 4, 70] },
    },
    {
      eye: { at: [0, 300, -300] },
      fov: 45,
      id: "aerial",
      target: { at: "gate" },
    },
  ],
});

const flipPart = (part: typeof PlanPart.Encoded) =>
  Object.fromEntries(Object.entries(part).toReversed());

const moved = (value: number) => (value === 0 ? 1 : value * 2);

const marks = { arrival: [0, 26, 0], gate: [30, 26, 40] } as const;

describe("plan cache key", () => {
  it.effect.prop(
    "stays the same when only the order of the plan's or the cameras' keys changes",
    { plan: Arbitrary.schema(PlanValue) },
    ({ plan }) =>
      Effect.gen(function* reorder() {
        const encoded = yield* Schema.encodeEffect(PlanBody)(plan);

        const read = yield* decodePlan(JSON.stringify(encoded));

        const reordered = yield* decodePlan(
          JSON.stringify(
            Object.fromEntries([
              ["shapes", encoded.shapes.map(flipPart)],
              [
                "landmarks",
                Object.fromEntries(
                  Object.entries(encoded.landmarks).toReversed()
                ),
              ],
            ])
          )
        );

        const version = PLAN_RENDERER_VERSION;

        expect(planKeyText({ cameras, plan: reordered, version })).toBe(
          planKeyText({ cameras, plan: read, version })
        );
      })
  );

  it.prop(
    "changes when a shape, a landmark, a camera or the renderer version changes",
    {
      name: Arbitrary.schema(Schema.String),
      plan: Arbitrary.schema(PlanValue),
    },
    ({ name, plan }) => {
      const inputs = { cameras, plan, version: PLAN_RENDERER_VERSION };
      const key = planKeyText(inputs);
      const [first, ...rest] = plan.parts;

      if (first === undefined) {
        return;
      }

      const grown = {
        ...first,
        size: [moved(first.size[0]), first.size[1], first.size[2]] as const,
      };

      const [camera, ...others] = cameras.cameras;

      const changed = [
        { ...inputs, plan: { ...plan, parts: [grown, ...rest] } },
        { ...inputs, plan: { ...plan, parts: [...plan.parts, first] } },
        {
          ...inputs,
          plan: {
            ...plan,
            landmarks: {
              ...plan.landmarks,
              [name]: [moved(plan.landmarks[name]?.[0] ?? 0), 0, 0] as const,
            },
          },
        },
        {
          ...inputs,
          cameras: {
            cameras: [{ ...camera, fov: camera.fov + 1 }, ...others] as const,
          },
        },
        {
          ...inputs,
          cameras: {
            cameras: [{ ...camera, id: `${camera.id}+` }, ...others] as const,
          },
        },
        { ...inputs, version: `${inputs.version}+` },
      ];

      for (const each of changed) {
        expect(planKeyText(each)).not.toBe(key);
      }
    }
  );

  it.effect("is a short hex digest of the key text", () =>
    Effect.gen(function* digest() {
      const plan = yield* decodePlan(
        '{"landmarks":{"gate":[30,26,40]},"shapes":[]}'
      );

      const key = yield* planKey({ cameras, plan, version: "1" });

      expect(key).toMatch(/^[0-9a-f]{20}$/u);
    }).pipe(Effect.provide(layerWebCrypto))
  );
});

describe("plan cameras", () => {
  it.effect.prop(
    "stand the given studs up and forward of their landmark, along the flat line to the second",
    {
      ahead: Arbitrary.schema(
        Schema.Finite.check(Schema.isBetween({ maximum: 500, minimum: -500 }))
      ),
      up: Arbitrary.schema(
        Schema.Finite.check(Schema.isBetween({ maximum: 500, minimum: -500 }))
      ),
    },
    ({ ahead, up }) =>
      Effect.gen(function* stand() {
        const set = yield* Schema.decodeEffect(CameraSet)({
          cameras: [
            {
              eye: {
                along: ["arrival", "gate"],
                at: "arrival",
                move: [0, up, ahead],
              },
              fov: 60,
              id: "one",
              target: { at: "gate" },
            },
          ],
        });

        const [placed] = yield* placeCameras(set, marks);
        const eye = placed?.eye ?? [Number.NaN, Number.NaN, Number.NaN];

        expect(eye[0]).toBeCloseTo((30 / 50) * ahead, 6);
        expect(eye[1]).toBeCloseTo(26 + up, 6);
        expect(eye[2]).toBeCloseTo((40 / 50) * ahead, 6);
      })
  );

  it.effect("fails typed on a camera the set does not name", () =>
    Effect.gen(function* unknown() {
      const problem = yield* placeCameras(cameras, marks, ["street"]).pipe(
        Effect.flip
      );

      expect(problem._tag).toBe("UnknownCamera");
      expect(problem).toMatchObject({
        camera: "street",
        known: ["arrival", "aerial"],
      });
    })
  );

  it.effect("fails typed on a landmark the plan does not have", () =>
    Effect.gen(function* missing() {
      const problem = yield* placeCameras(cameras, { arrival: [0, 0, 0] }).pipe(
        Effect.flip
      );

      expect(problem).toBeInstanceOf(UnknownLandmark);
      expect(problem).toMatchObject({
        camera: "arrival",
        landmark: "gate",
      });
    })
  );
});

describe("plan file", () => {
  it.effect(
    "reads the village file's first village and adds its frame as centre",
    () =>
      Effect.gen(function* village() {
        const plan = yield* decodePlan(
          '{"villages":[{"frame":[5,26,7,1,0,0,0,1,0,0,0,1],"landmarks":{"gate":[30,26,40]},"shapes":[{"cf":[0,0,0,1,0,0,0,1,0,0,0,1],"kind":"Ground","shape":"Cylinder","size":[4,1,4]}]}]}'
        );

        expect(plan.landmarks.centre).toEqual([5, 26, 7]);
        expect(plan.parts.map(({ form }) => form)).toEqual(["Cylinder"]);
      })
  );
});

describe("project mounts", () => {
  it.effect(
    "mounts every ReplicatedStorage path, parents before children",
    () =>
      Effect.gen(function* mounts() {
        const listed = yield* projectMounts(
          JSON.stringify({
            tree: {
              $className: "DataModel",
              ReplicatedStorage: {
                Shared: {
                  $path: "src/shared",
                  Features: {
                    SkyIsland: {
                      $path: { optional: "src/features/SkyIsland/Shared" },
                    },
                  },
                },
              },
            },
          })
        );

        expect(listed).toEqual([
          { at: "ReplicatedStorage/Shared", path: "src/shared" },
          {
            at: "ReplicatedStorage/Shared/Features/SkyIsland",
            path: "src/features/SkyIsland/Shared",
          },
        ]);
      })
  );
});

describe("plan cameras from the plan command", () => {
  it.effect(
    "keeps the cameras a plan command placed itself, and none when it placed none",
    () =>
      Effect.gen(function* readCameras() {
        const wall = {
          cf: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
          kind: "Wall",
          size: [4, 4, 4],
        } as const;

        const placed = {
          eye: { at: [92, 40, -118] },
          fov: 40,
          id: "house.three",
          target: { at: [0, 22, 0] },
        } as const;

        const withCameras = yield* Schema.encodeEffect(PlanBody)({
          cameras: [placed],
          landmarks: {},
          parts: [wall],
        });

        const without = yield* Schema.encodeEffect(PlanBody)({
          landmarks: {},
          parts: [wall],
        });

        const own = yield* decodePlan(JSON.stringify(withCameras));
        const bare = yield* decodePlan(JSON.stringify(without));

        expect(own.cameras?.map(({ id }) => id)).toEqual(["house.three"]);
        expect(bare.cameras).toBeUndefined();
      })
  );
});
