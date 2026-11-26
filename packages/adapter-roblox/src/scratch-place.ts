import { Schema } from "effect";

const Node = Schema.Record(Schema.String, Schema.Json);

const isNode = Schema.is(Node);

const isPlainPath = Schema.is(Schema.String);

const isOptionalPath = Schema.is(Schema.Struct({ optional: Schema.String }));

export interface PlaceRoots {
  readonly game: string;
  readonly has: (relative: string) => boolean;
  readonly join: (root: string, relative: string) => string;
  readonly tree: string;
}

const slashed = (where: string) => where.replaceAll("\\", "/");

const rooted = (relative: string, roots: PlaceRoots) =>
  slashed(roots.join(roots.has(relative) ? roots.tree : roots.game, relative));

const rewrite = (node: typeof Node.Type, roots: PlaceRoots): typeof Node.Type =>
  Object.fromEntries(
    Object.entries(node).map(([name, child]) => {
      if (name === "$path" && isPlainPath(child)) {
        return [name, rooted(child, roots)];
      }

      if (name === "$path" && isOptionalPath(child)) {
        return [name, { optional: rooted(child.optional, roots) }];
      }

      return [name, isNode(child) ? rewrite(child, roots) : child];
    })
  );

export const projectPaths = (node: Schema.Json): readonly string[] => {
  if (!isNode(node)) {
    return [];
  }

  return Object.entries(node).flatMap(([name, child]) => {
    if (name === "$path" && isPlainPath(child)) {
      return [child];
    }

    if (name === "$path" && isOptionalPath(child)) {
      return [child.optional];
    }

    return projectPaths(child);
  });
};

export const readProject = (text: string) =>
  Schema.decodeEffect(Schema.fromJsonString(Node))(text);

export const placeProject = (
  project: typeof Node.Type,
  roots: PlaceRoots
): typeof Node.Type => {
  const { servePort: _port, ...rest } = rewrite(project, roots);

  return rest;
};
