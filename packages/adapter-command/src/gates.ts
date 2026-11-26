import { AdapterFailed, GateResult } from "@gds/model";
import type {
  GateDef,
  GatePass,
  Render,
  RenderRequest,
  StudioDef,
} from "@gds/model";
import { Effect, Option, Predicate, Schema } from "effect";

import { runArgv, tailOf } from "./run-command.js";

type Json = Schema.Json;

const sameJson = Schema.toEquivalence(Schema.Json);

const INDEX = /^(?:0|[1-9]\d*)$/u;

const asList = Schema.decodeUnknownOption(Schema.Array(Schema.Json));

const asRecord = Schema.decodeUnknownOption(
  Schema.Record(Schema.String, Schema.Json)
);

const childAt = (current: Json, key: string): Option.Option<Json> => {
  const list = asList(current);

  if (Option.isSome(list)) {
    return INDEX.test(key)
      ? Option.fromUndefinedOr(list.value[Number(key)])
      : Option.none();
  }

  return Option.flatMap(asRecord(current), (record) =>
    Object.hasOwn(record, key)
      ? Option.fromUndefinedOr(record[key])
      : Option.none()
  );
};

export const readPath = (value: Json, dotted: string): Option.Option<Json> => {
  let found = Option.some(value);

  for (const key of dotted === "" ? [] : dotted.split(".")) {
    found = found.pipe(Option.flatMap((current) => childAt(current, key)));
  }

  return found;
};

export const judge = (pass: typeof GatePass.Type, value: Json): boolean => {
  if ("truthy" in pass) {
    return value !== null && value !== false && value !== 0 && value !== "";
  }

  if (pass.op === "eq") {
    return sameJson(value, pass.value);
  }

  if (!Predicate.isNumber(value)) {
    return false;
  }

  switch (pass.op) {
    case "lt": {
      return value < pass.value;
    }

    case "le": {
      return value <= pass.value;
    }

    case "gt": {
      return value > pass.value;
    }

    case "ge": {
      return value >= pass.value;
    }

    default: {
      return false;
    }
  }
};

export const ruleText = (pass: typeof GatePass.Type): string =>
  "truthy" in pass ? "truthy" : `${pass.op} ${JSON.stringify(pass.value)}`;

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
