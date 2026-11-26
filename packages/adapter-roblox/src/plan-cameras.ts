import { Effect, Schema } from "effect";

import { UnknownCamera } from "./unknown-camera.js";
import { UnknownLandmark } from "./unknown-landmark.js";

export const Point = Schema.Tuple([
  Schema.Finite,
  Schema.Finite,
  Schema.Finite,
]);

export type PointValue = typeof Point.Type;

export const Anchor = Schema.Struct({
  along: Schema.optionalKey(
    Schema.Tuple([Schema.String, Schema.String]).annotate({
      description:
        "Two landmarks; forward is the flat direction from the first to the second. Left out, forward is +Z.",
    })
  ),
  at: Schema.Union([Schema.String, Point]).annotate({
    description: "A landmark name from the plan, or a world point.",
  }),
  move: Schema.optionalKey(
    Point.annotate({
      description: "Studs to the right, up and forward of the anchor.",
    })
  ),
});

export const CameraDef = Schema.Struct({
  eye: Anchor,
  figure: Schema.optionalKey(
    Anchor.annotate({
      description: "Where a 5-stud figure stands, facing forward.",
    })
  ),
  fov: Schema.Finite,
  id: Schema.String,
  target: Anchor,
});

export const CameraSet = Schema.Struct({
  cameras: Schema.NonEmptyArray(CameraDef),
});

export type CameraSetValue = typeof CameraSet.Type;

export interface Figure {
  readonly at: PointValue;
  readonly facing: readonly [number, number];
}

export interface PlacedCamera {
  readonly eye: PointValue;
  readonly figure?: Figure | undefined;
  readonly fov: number;
  readonly id: string;
  readonly target: PointValue;
}

const isName = Schema.is(Schema.String);

type Landmarks = Readonly<Record<string, PointValue>>;

const unknownCamera = (camera: string, known: readonly string[]) =>
  new UnknownCamera({
    camera,
    known,
    message: `No camera named ${camera}. The studio's camera file names ${known.join(", ")}. Fix: ask for one of those, or add ${camera} to the file named by "cameras" in the studio.`,
  });

const placeAnchor = (
  camera: string,
  anchor: typeof Anchor.Type,
  landmarks: Landmarks
): Effect.Effect<Figure, UnknownLandmark> =>
  Effect.gen(function* placeOneAnchor() {
    const known = Object.keys(landmarks).toSorted();

    const mark = (name: string) => {
      const found = landmarks[name];

      return found === undefined
        ? Effect.fail(
            new UnknownLandmark({
              camera,
              known,
              landmark: name,
              message: `Camera ${camera} stands on landmark ${name}, which the plan does not have. The plan names ${known.join(", ")}. Fix: point the camera at one of those in the studio's camera file, or make the plan command write ${name} into its landmarks.`,
            })
          )
        : Effect.succeed(found);
    };

    const at = isName(anchor.at) ? yield* mark(anchor.at) : anchor.at;

    let forward: readonly [number, number] = [0, 1];

    if (anchor.along !== undefined) {
      const from = yield* mark(anchor.along[0]);
      const to = yield* mark(anchor.along[1]);
      const dx = to[0] - from[0];
      const dz = to[2] - from[2];
      const length = Math.hypot(dx, dz);

      forward = length === 0 ? [0, 1] : [dx / length, dz / length];
    }

    const [right, up, ahead] = anchor.move ?? [0, 0, 0];
    const [fx, fz] = forward;

    return {
      at: [
        at[0] - fz * right + fx * ahead,
        at[1] + up,
        at[2] + fx * right + fz * ahead,
      ],
      facing: forward,
    };
  });

export const placeCameras = (
  set: CameraSetValue,
  landmarks: Landmarks,
  chosen?: readonly string[]
): Effect.Effect<readonly PlacedCamera[], UnknownCamera | UnknownLandmark> =>
  Effect.gen(function* placeEveryCamera() {
    const ids = set.cameras.map(({ id }) => id);
    const wanted = chosen ?? ids;
    const placed: PlacedCamera[] = [];

    for (const id of wanted) {
      const camera = set.cameras.find((entry) => entry.id === id);

      if (camera === undefined) {
        return yield* unknownCamera(id, ids);
      }

      const eye = yield* placeAnchor(id, camera.eye, landmarks);
      const target = yield* placeAnchor(id, camera.target, landmarks);

      const figure =
        camera.figure === undefined
          ? undefined
          : yield* placeAnchor(id, camera.figure, landmarks);

      placed.push({
        eye: eye.at,
        figure,
        fov: camera.fov,
        id,
        target: target.at,
      });
    }

    return placed;
  });
