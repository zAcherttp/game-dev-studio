// @effect-diagnostics-next-line nodeBuiltinImport:off -- a plain child script the command adapter spawns; it stands in for a game command, not Effect code
import { mkdirSync, writeFileSync } from "node:fs";

const verb = process.argv.at(2) ?? "none";

const chunks: Uint8Array[] = [];

for await (const chunk of process.stdin) {
  chunks.push(Buffer.from(String(chunk)));
}

const text = Buffer.concat(chunks).toString("utf-8");

const field = (pattern: RegExp) => pattern.exec(text)?.groups?.value ?? "none";

type Printed =
  | string
  | number
  | boolean
  | null
  | readonly Printed[]
  | { readonly [key: string]: Printed };

const print = (value: Printed) => {
  process.stdout.write(JSON.stringify(value));
};

const take = field(/"variant":\{"generator":"[^"]*","id":"(?<value>[^"]+)"/u);

switch (verb) {
  case "assets": {
    print([{ id: "stool", kind: "piece", title: "Stool" }]);
    break;
  }

  case "takes": {
    print(
      ["t1", "t2"].map((id) => ({
        generator: "fixture",
        id,
        label: id,
        layer: field(/"layer":"(?<value>[^"]+)"/u),
        params: {},
      }))
    );
    break;
  }

  case "render": {
    const image = `out/${take}.png`;

    mkdirSync("out", { recursive: true });
    writeFileSync(image, "png");
    print({ kind: "image", ms: 1, path: image });
    break;
  }

  case "gate": {
    print({ fights: take === "t1" ? 0 : 2 });
    break;
  }

  default: {
    process.stderr.write(`unknown verb ${verb}`);
    process.exitCode = 2;
  }
}
