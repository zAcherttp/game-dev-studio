import {
  AdapterFailed,
  GateResult,
  judge,
  readPath,
  ruleText,
} from "@gds/model";
import type { GateDef, Render, RenderRequest, StudioDef } from "@gds/model";
import { Effect, Option, Schema } from "effect";

import { runArgv, tailOf } from "./run-command.js";

type Json = Schema.Json;

export const variantGates = (
  studio: typeof StudioDef.Type,
  layer: string
): readonly (typeof GateDef.Type)[] =>
  studio.gates.filter(
    (gate) =>
      gate.where === "variant" &&
      (gate.layers === undefined || gate.layers.includes(layer))
  );

const decodeJson = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Json)
);

const finish = (gate: typeof GateDef.Type, value: Json) => {
  const ok = judge(gate.pass, value);

  return GateResult.make({
    id: gate.id,
    note: `${gate.title}: ${JSON.stringify(value)} ${ok ? "meets" : "fails"} ${ruleText(gate.pass)}`,
    ok,
    value,
  });
};

export const runGate = Effect.fnUntraced(function* runGate(
  gate: typeof GateDef.Type,
  request: RenderRequest,
  render: typeof Render.Type
) {
  const adapter = `gate:${gate.id}`;
  const shown = gate.run.join(" ");

  const ran = yield* runArgv(
    adapter,
    gate.run,
    { ...request, render },
    gate.cwd
  );

  const { json } = gate;

  if (json === undefined) {
    return finish(gate, ran.code);
  }

  const parsed = decodeJson(ran.stdout.trim());

  if (Option.isNone(parsed)) {
    return yield* new AdapterFailed({
      adapter,
      message: `Gate ${gate.id} (\`${shown}\`, exit ${ran.code}) printed no JSON to read ${json} from. Printed: ${tailOf(ran.stdout) || "(nothing)"}; stderr: ${tailOf(ran.stderr) || "(none)"}. Fix: make the gate command print one JSON object on stdout.`,
    });
  }

  const value = readPath(parsed.value, json);

  if (Option.isNone(value)) {
    return yield* new AdapterFailed({
      adapter,
      message: `Gate ${gate.id} printed JSON without ${json}: ${tailOf(ran.stdout)}. The gate's \`json\` path and the command's output disagree. Fix: correct \`json\` in the studio file or the command's output.`,
    });
  }

  return finish(gate, value.value);
});

export const runGates = (
  studio: typeof StudioDef.Type,
  request: RenderRequest,
  render: typeof Render.Type
) =>
  Effect.forEach(variantGates(studio, request.layer), (gate) =>
    runGate(gate, request, render)
  );
