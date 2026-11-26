import { Effect, Schema } from "effect";

const Node = Schema.Record(Schema.String, Schema.Json);

const Project = Schema.fromJsonString(
  Schema.Struct({ tree: Schema.Struct({ ReplicatedStorage: Node }) })
);

const isNode = Schema.is(Node);

const isPlainPath = Schema.is(Schema.String);

const isOptionalPath = Schema.is(Schema.Struct({ optional: Schema.String }));

export interface Mount {
  readonly at: string;
  readonly path: string;
}

const walk = (node: typeof Node.Type, at: string): readonly Mount[] => {
  const own = node.$path;

  const here: readonly Mount[] = [
    ...(isPlainPath(own) ? [{ at, path: own }] : []),
    ...(isOptionalPath(own) ? [{ at, path: own.optional }] : []),
  ];

  return [
    ...here,
    ...Object.entries(node).flatMap(([name, child]) =>
      name.startsWith("$") || !isNode(child) ? [] : walk(child, `${at}/${name}`)
    ),
  ];
};

export const projectMounts = (text: string) =>
  Schema.decodeEffect(Project)(text).pipe(
    Effect.map((project) =>
      walk(project.tree.ReplicatedStorage, "ReplicatedStorage").filter(
        ({ at }) => at !== "ReplicatedStorage"
      )
    )
  );
