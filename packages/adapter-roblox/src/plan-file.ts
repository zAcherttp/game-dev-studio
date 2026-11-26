import { Effect, Schema } from "effect";

import { Point } from "./plan-cameras.js";

const Rgb = Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite]);

export const PlanPart = Schema.Struct({
  cf: Schema.Array(Schema.Finite).check(
    Schema.isMinLength(12),
    Schema.isMaxLength(12)
  ),
  color: Schema.optionalKey(Schema.NullOr(Rgb)),
  far: Schema.optionalKey(Schema.Boolean),
  form: Schema.optionalKey(Schema.String),
  kind: Schema.String,
  material: Schema.optionalKey(Schema.String),
  size: Point,
  solid: Schema.optionalKey(Schema.Boolean),
  wedge: Schema.optionalKey(Schema.Boolean),
}).pipe(Schema.encodeKeys({ form: "shape" }));

export const PlanBody = Schema.Struct({
  frame: Schema.optionalKey(Schema.Array(Schema.Finite)),
  landmarks: Schema.Record(Schema.String, Point),
  parts: Schema.Array(PlanPart),
}).pipe(Schema.encodeKeys({ parts: "shapes" }));

const VillageFile = Schema.Struct({
  villages: Schema.NonEmptyArray(PlanBody),
});

const PlanText = Schema.fromJsonString(Schema.Union([PlanBody, VillageFile]));

export interface Plan {
  readonly landmarks: Readonly<Record<string, typeof Point.Type>>;
  readonly parts: readonly (typeof PlanPart.Type)[];
}

export const CENTRE = "centre";

const fromBody = (body: typeof PlanBody.Type): Plan => {
  const [x, y, z] = body.frame ?? [];

  return {
    landmarks:
      x === undefined ||
      y === undefined ||
      z === undefined ||
      CENTRE in body.landmarks
        ? body.landmarks
        : { ...body.landmarks, [CENTRE]: [x, y, z] },
    parts: body.parts,
  };
};

export const decodePlan = (text: string) =>
  Schema.decodeEffect(PlanText)(text).pipe(
    Effect.map((decoded) =>
      fromBody("villages" in decoded ? decoded.villages[0] : decoded)
    )
  );

export const DRAWN_OUT = "Collision";

export const drawnParts = (plan: Plan): number =>
  plan.parts.filter(({ kind }) => kind !== DRAWN_OUT).length;
