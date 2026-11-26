// @effect-diagnostics-next-line nodeBuiltinImport:off -- a plain child script the command runner spawns; it stands in for a game command, not Effect code
import { mkdirSync, writeFileSync } from "node:fs";

import { Schema } from "effect";

const Request = Schema.Struct({
  layer: Schema.optionalKey(Schema.String),
  render: Schema.optionalKey(Schema.Struct({ path: Schema.String })),
  variant: Schema.optionalKey(
    Schema.Struct({
      id: Schema.String,
      params: Schema.Record(Schema.String, Schema.Finite),
    })
  ),
});

const verb = process.argv.at(2) ?? "none";

const chunks: Uint8Array[] = [];

for await (const chunk of process.stdin) {
  chunks.push(Buffer.from(String(chunk)));
}

const request = Schema.decodeSync(Schema.fromJsonString(Request))(
  Buffer.concat(chunks).toString("utf-8") || "{}"
);

const print = (value: Schema.Json) => {
  process.stdout.write(JSON.stringify(value));
};

const params = request.variant?.params ?? {};

const takeId = request.variant?.id ?? "none";

switch (verb) {
  case "apply": {
    print({ changed: [`config/${takeId}.luau`] });
    break;
  }

  case "assets": {
    print([
      { id: "Kit/Stool", kind: "piece", title: "Stool" },
      { id: "village", kind: "map", title: "Village" },
    ]);
    break;
  }

  case "bad": {
    process.stdout.write("rendered ok, no json here");
    break;
  }

  case "exit": {
    process.exitCode = params.code ?? 0;
    break;
  }

  case "fail": {
    process.stderr.write("generator crashed: no such seed");
    process.exitCode = 3;
    break;
  }

  case "gate": {
    print({
      figures: { problems: params.problems ?? 0 },
      render: request.render?.path ?? null,
    });
    break;
  }

  case "render": {
    const image = `out/${takeId}.png`;

    mkdirSync("out", { recursive: true });
    writeFileSync(image, "png");
    print({
      kind: "image",
      ms: 1,
      path: image,
      views: [{ camera: "front", path: image }],
    });
    break;
  }

  case "slow": {
    // @effect-diagnostics-next-line globalTimers:off -- the stand-in game command must outlive the runner timeout as a real process
    setTimeout(() => {
      print([]);
    }, 20_000);
    break;
  }

  case "takes": {
    const layer = request.layer ?? "none";

    print([
      {
        generator: "fixture",
        id: `${layer}-1`,
        label: "one",
        layer,
        params: { seed: 1 },
      },
    ]);
    break;
  }

  default: {
    process.stderr.write(`unknown verb ${verb}`);
    process.exitCode = 2;
  }
}
