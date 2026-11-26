import { Effect, Schema } from "effect";

import { UnknownCamera } from "./unknown-camera.js";

const Point = Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite]);

export const ShotCamera = Schema.Struct({
  fov: Schema.optionalKey(Schema.Finite),
  frame: Schema.optionalKey(
    Schema.Struct({ anchor: Schema.optionalKey(Schema.String) })
  ),
  id: Schema.String,
  lookAt: Schema.optionalKey(Point),
  pending: Schema.optionalKey(Schema.String),
  position: Schema.optionalKey(Point),
});

export const ShotSetup = Schema.Struct({
  settle: Schema.optionalKey(
    Schema.Finite.annotate({
      description:
        "Seconds the place settles after the camera moves, before the shot.",
    })
  ),
  stage: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description:
        "Dev calls run on the server before the shots, such as `Module.fn($seed)`.",
    })
  ),
});

export const ShotCameraFile = Schema.Struct({
  cameras: Schema.Array(ShotCamera),
  layers: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Array(Schema.String))
  ),
  shot: Schema.optionalKey(ShotSetup),
});

export type ShotCameraFileValue = typeof ShotCameraFile.Type;

export const decodeShotCameras = Schema.decodeUnknownEffect(
  Schema.fromJsonString(ShotCameraFile)
);

export const DEFAULT_FOV = 70;

export interface PlacedShot {
  readonly fov: number;
  readonly id: string;
  readonly lookAt: readonly [number, number, number];
  readonly position: readonly [number, number, number];
}

export type ShotCameras =
  | { readonly kind: "ready"; readonly cameras: readonly PlacedShot[] }
  | {
      readonly kind: "pending";
      readonly reason: string;
      readonly cameras: readonly PlacedShot[];
    };

const whyUnplaced = (camera: typeof ShotCamera.Type): string | undefined => {
  if (camera.pending !== undefined) {
    return camera.pending;
  }

  if (camera.frame?.anchor !== undefined) {
    return `framed on ${camera.frame.anchor}, and a Studio shot needs world studs`;
  }

  if (camera.position === undefined || camera.lookAt === undefined) {
    return "no position and lookAt in world studs";
  }

  return undefined;
};

export const namedShotCameras = (
  file: ShotCameraFileValue,
  layer: string,
  chosen?: readonly string[]
): readonly string[] => chosen ?? file.layers?.[layer] ?? [];

export const shotCameras = (
  file: ShotCameraFileValue,
  layer: string,
  chosen?: readonly string[]
): Effect.Effect<ShotCameras, UnknownCamera> =>
  Effect.gen(function* placeShotCameras() {
    const names = namedShotCameras(file, layer, chosen);
    const known = file.cameras.map(({ id }) => id);

    if (names.length === 0) {
      return yield* new UnknownCamera({
        camera: layer,
        known,
        message: `The camera file names no cameras for layer ${layer}. A Studio shot is taken per named camera. Fix: list the layer's cameras under "layers"."${layer}" in the studio's camera file.`,
      });
    }

    const placed: PlacedShot[] = [];
    const waiting: string[] = [];

    for (const name of names) {
      const camera = file.cameras.find(({ id }) => id === name);

      if (camera === undefined) {
        return yield* new UnknownCamera({
          camera: name,
          known,
          message: `No camera ${name} in the camera file; it has ${known.join(", ")}. Fix: add it to the studio's camera file or correct the layer's list.`,
        });
      }

      const why = whyUnplaced(camera);

      if (why === undefined && camera.position && camera.lookAt) {
        placed.push({
          fov: camera.fov ?? DEFAULT_FOV,
          id: camera.id,
          lookAt: camera.lookAt,
          position: camera.position,
        });
      } else {
        waiting.push(`${name} (${why ?? "not placed"})`);
      }
    }

    return waiting.length === 0
      ? { cameras: placed, kind: "ready" as const }
      : {
          cameras: placed,
          kind: "pending" as const,
          reason: `Studio cameras not placed yet: ${waiting.join("; ")}`,
        };
  });
