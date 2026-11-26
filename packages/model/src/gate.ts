import { Schema } from "effect";

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
