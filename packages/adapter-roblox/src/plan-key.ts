import { Effect } from "effect";

import type { CameraSetValue } from "./plan-cameras.js";
import type { Plan } from "./plan-file.js";
import { digestText, sortedKeys } from "./render-key.js";

export const PLAN_RENDERER_VERSION = "1";

export interface PlanKeyInputs {
  readonly cameras: CameraSetValue;
  readonly plan: Plan;
  readonly version: string;
}

export const planKeyText = (inputs: PlanKeyInputs): string =>
  JSON.stringify(
    { cameras: inputs.cameras, plan: inputs.plan, version: inputs.version },
    sortedKeys
  );

export const planKey = (inputs: PlanKeyInputs) =>
  Effect.map(digestText(planKeyText(inputs)), (hex) => hex.slice(0, 20));
