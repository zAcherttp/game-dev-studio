import { Option, Predicate, Schema } from "effect";

const Comparison = Schema.Literals(["lt", "le", "gt", "ge"]).annotate({
  description: "How the read value compares to the pass value.",
});

export const GatePass = Schema.Union([
  Schema.Struct({ op: Schema.Literal("eq"), value: Schema.Json }),
  Schema.Struct({ op: Comparison, value: Schema.Finite }),
  Schema.Struct({ truthy: Schema.Literal(true) }),
]).annotate({
  description:
    "The rule the read value must meet: equal to a value, compared with a number, or truthy.",
});

export const GateDef = Schema.Struct({
  cwd: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "Directory inside the game checkout the command runs in; the checkout root when left out.",
    })
  ),
  id: Schema.String,
  kinds: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description:
        "The asset kinds the gate runs on, as the studio's asset list names them; every asset when left out. An asset with no kind runs only gates without kinds.",
    })
  ),
  json: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "Dotted path to the value in the command's JSON output. Without it the value is the command's exit code.",
    })
  ),
  layers: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: "The layers the gate runs on; every layer when left out.",
    })
  ),
  pass: GatePass,
  run: Schema.NonEmptyArray(Schema.String).annotate({
    description: "The command and its arguments, run without a shell.",
  }),
  title: Schema.String,
  where: Schema.Literals(["variant", "check"]).annotate({
    description:
      "variant: run offline on each variant. check: run inside the studio's engine check.",
  }),
}).annotate({
  description:
    "A gate as data: a command, where it runs, and the rule its value must pass. Its outcome is a GateResult.",
});

type Json = Schema.Json;

export const gateApplies = (
  gate: typeof GateDef.Type,
  kind: string | undefined
): boolean =>
  gate.kinds === undefined || (kind !== undefined && gate.kinds.includes(kind));

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
