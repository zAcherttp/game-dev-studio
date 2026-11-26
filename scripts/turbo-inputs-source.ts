import * as ts from "typescript/unstable/ast";
import type { Node, SourceFile } from "typescript/unstable/ast";

import {
  existsSync,
  fileURLToPath,
  globSync,
  path,
  pathToFileURL,
  realpathSync,
  statSync,
} from "./turbo-inputs-io.ts";

type ReadBoundary =
  | {
      readonly kind: "hashed";
      readonly root: string;
      readonly exclude?: readonly string[];
    }
  | { readonly kind: "fixture"; readonly root: string }
  | { readonly kind: "unbounded"; readonly reason: string };

const hashed = (...roots: readonly string[]): readonly ReadBoundary[] =>
  roots.map((root) => ({ kind: "hashed", root }));

export const generatedSourceBoundaries = hashed();

const temporary = (
  root = "<test-created temporary directory>/**"
): readonly ReadBoundary[] => [{ kind: "fixture", root }];

const parameterizedReadBoundaries = new Map(
  Object.entries<readonly ReadBoundary[]>({
    "apps/web/test/accent.test.ts": hashed("apps/web/src/**"),
    "packages/core/test/bump-checkers.test.ts": [
      ...hashed(
        "scripts/bump-checkers.ts",
        "scripts/checker-age-exceptions.ts"
      ),
      ...temporary(".gds/checker-bump-test-*/**"),
    ],
    "packages/core/test/fence-messages.test.ts": hashed(
      "oxlint.config.ts",
      "scripts/**/*.{ts,js,mjs,cjs}",
      "tools/oxlint/**/*.ts"
    ),
    "packages/core/test/docs-pins.test.ts": hashed(
      "AGENTS.md",
      "README.md",
      "package.json",
      "apps/*/package.json",
      "packages/*/package.json"
    ),
    "packages/core/test/lockfile-guard.test.ts": [
      ...hashed("package.json"),
      ...temporary(),
    ],
    "packages/core/test/no-comments-rule.test.ts": [
      ...hashed("scripts/oxlint-plugin-no-comments.ts"),
      ...temporary(),
    ],
    "packages/adapter-roblox/src/easyvfx-kits.ts": [
      {
        kind: "unbounded",
        reason:
          "reads the EasyVFX checkout and game kit folders RobloxConfig names at run time; tests use EasyvfxKits.fromListing",
      },
    ],
    "packages/adapter-roblox/src/render-cache.ts": temporary(),
    "packages/adapter-roblox/src/ror-renderer.ts": [
      {
        kind: "unbounded",
        reason:
          "reads the game's assets/assets.md, art/vfx/out and kit folders RobloxConfig names at run time to draw local textures; no test reads them",
      },
    ],
    "packages/adapter-roblox/src/sync-beat.ts": [
      {
        kind: "unbounded",
        reason:
          "reads beat sheets from the game kit folders RobloxConfig names at run time; no test reads them",
      },
    ],
    "packages/motion/test/vendoring.test.ts": hashed(
      "packages/motion/src/*.pure.ts"
    ),
  })
);

export const runtimeReadBoundaries = (root: string, file: string) =>
  parameterizedReadBoundaries.get(path.relative(root, file));

const unknownRead = (name: string, reference: string | null) =>
  !["URL", "join", "resolve"].includes(name) &&
  (reference === null ||
    (reference.includes("*") && !["glob", "globSync"].includes(name)));

export const sourcePattern = /\.(?:[cm]?[jt]sx?)$/u;

export const inside = (root: string, file: string) => {
  const relative = path.relative(root, file);

  return !relative.startsWith("..") && !path.isAbsolute(relative);
};

export const sourceCandidates = (file: string) => [
  file,
  file.replace(/\.[cm]?jsx?$/u, ".ts"),
  file.replace(/\.[cm]?jsx?$/u, ".tsx"),
  `${file}.ts`,
  `${file}.tsx`,
  `${file}/index.ts`,
];

export const candidate = (file: string) =>
  sourceCandidates(file).find(
    (entry) => existsSync(entry) && statSync(entry).isFile()
  );

const isString = (node: Node) =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);

const literal = (node: Node) => (isString(node) ? node.text : undefined);

const walk = (node: Node, visit: (node: Node) => void): void => {
  visit(node);
  node.forEachChild((child) => {
    walk(child, visit);
  });
};

type Evaluate = (
  node: Node | undefined,
  seen?: ReadonlySet<string>
) => string | null;

const nameOf = (node: Node, ast: SourceFile) =>
  node.getText(ast).split(".").at(-1);

type ImportValue = (specifier: string, name: string) => string | null;

export const stringBinding = (ast: SourceFile, name: string): string | null => {
  let value: string | null = null;

  walk(ast, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer !== undefined
    ) {
      value = literal(node.initializer) ?? null;
    }
  });

  return value;
};

interface SourceEvaluator {
  readonly evaluate: Evaluate;
  readonly evaluateSelector: (node: Node) => string | null;
}

const evaluator = (
  file: string,
  cwd: string,
  ast: SourceFile,
  importedValue: ImportValue
): SourceEvaluator => {
  const bindings = new Map<string, Node>();
  const imports = new Map<string, { specifier: string; name: string }>();

  walk(ast, (node) => {
    if (
      ts.isImportDeclaration(node) &&
      node.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      const specifier = literal(node.moduleSpecifier);

      if (specifier !== undefined) {
        for (const entry of node.importClause.namedBindings.elements) {
          imports.set(entry.name.text, {
            specifier,
            name: (entry.propertyName ?? entry.name).text,
          });
        }
      }
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      bindings.set(node.name.text, node.initializer);
    }
  });

  const member = (
    node: ts.PropertyAccessExpression,
    seen: ReadonlySet<string>
  ): string | null => {
    if (node.expression.getText(ast) === "import.meta") {
      switch (node.name.text) {
        case "url": {
          return pathToFileURL(file).href;
        }

        case "filename": {
          return file;
        }

        case "dirname": {
          return path.dirname(file);
        }

        default: {
          return null;
        }
      }
    }

    if (["pathname", "href"].includes(node.name.text)) {
      const base = evaluate(node.expression, seen);

      return base !== null && base.startsWith("file:")
        ? fileURLToPath(base)
        : base;
    }

    return null;
  };

  const call = (
    node: ts.CallExpression | ts.NewExpression,
    seen: ReadonlySet<string>
  ): string | null => {
    const name = nameOf(node.expression, ast) ?? "";

    const args = (node.arguments ?? []).map((argument) =>
      evaluate(argument, seen)
    );

    const first = args.at(0) ?? null;
    const second = args.at(1) ?? null;

    if (
      name === "URL" &&
      first !== null &&
      second !== null &&
      second.startsWith("file:")
    ) {
      return new URL(first, second).href;
    }

    if (
      name === "fileURLToPath" &&
      first !== null &&
      first.startsWith("file:")
    ) {
      return fileURLToPath(first);
    }

    if (name === "dirname" && first !== null) {
      return path.dirname(first);
    }

    if (["join", "resolve"].includes(name) && first !== null) {
      return path.resolve(cwd, ...args.map((argument) => argument ?? "*"));
    }

    if (name === "cwd") {
      return cwd;
    }

    return null;
  };

  const template = (node: ts.TemplateExpression, seen: ReadonlySet<string>) => {
    if (
      node.head.text.length === 0 &&
      evaluate(node.templateSpans[0]?.expression, seen) === null
    ) {
      return null;
    }

    return `${node.head.text}${node.templateSpans.map((span) => `${evaluate(span.expression, seen) ?? "*"}${span.literal.text}`).join("")}`;
  };

  const evaluate: Evaluate = (node, seen = new Set()) => {
    if (node === undefined) {
      return null;
    }

    if (isString(node)) {
      return node.text;
    }

    if (ts.isTemplateExpression(node)) {
      return template(node, seen);
    }

    if (ts.isIdentifier(node) && !seen.has(node.text)) {
      const binding = bindings.get(node.text);
      const imported = imports.get(node.text);

      return binding === undefined && imported !== undefined
        ? importedValue(imported.specifier, imported.name)
        : evaluate(binding, new Set([...seen, node.text]));
    }

    if (
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isParenthesizedExpression(node)
    ) {
      return evaluate(node.expression, seen);
    }

    if (ts.isPropertyAccessExpression(node)) {
      return member(node, seen);
    }

    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      return call(node, seen);
    }

    return null;
  };

  const evaluateSelector = (node: Node): string | null => {
    if (isString(node)) {
      return node.text;
    }

    if (!ts.isIdentifier(node)) {
      return null;
    }

    const binding = bindings.get(node.text);
    const imported = imports.get(node.text);

    if (binding !== undefined) {
      return literal(binding) ?? null;
    }

    return imported === undefined
      ? null
      : importedValue(imported.specifier, imported.name);
  };

  return { evaluate, evaluateSelector };
};

const exclusions = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.agent_sources/**",
  "**/dist/**",
];

const expandAt = (
  root: string,
  base: string,
  input: string,
  directories: boolean,
  selector: boolean
) => {
  const full = path.resolve(base, input);

  if (!inside(root, full) || full.includes("node_modules")) {
    return [];
  }

  if (input.includes("*") || (selector && input.includes("{"))) {
    const matches = globSync(input, { cwd: base, exclude: exclusions })
      .map((entry) => path.resolve(base, entry))
      .filter((entry) => statSync(entry).isFile());

    if (matches.length > 0) {
      return matches;
    }
  }

  if (!existsSync(full)) {
    return [];
  }

  if (statSync(full).isFile()) {
    return [full];
  }

  if (directories && full !== root) {
    return globSync(path.join(full, "**/*"), { exclude: exclusions }).filter(
      (entry) => statSync(entry).isFile()
    );
  }

  return [];
};

const vitestSelectorSegment =
  /^(?:[\w.-]|\*(?!\*)|\{[\w.-]+(?:,[\w.-]+)+\})+$/u;

const supportedVitestSelector = (pattern: string) =>
  pattern
    .split("/")
    .every(
      (segment) =>
        segment !== "." &&
        segment !== ".." &&
        (segment === "**" ||
          (!segment.includes("**") && vitestSelectorSegment.test(segment)))
    );

const flatVitestTestOptions = (ast: SourceFile) => {
  const declaration = ast.statements.find(ts.isExportAssignment);
  const config = declaration?.expression;

  const object =
    config &&
    ts.isCallExpression(config) &&
    config.expression.getText(ast) === "defineConfig" &&
    ast.statements.some(
      (entry) =>
        ts.isImportDeclaration(entry) &&
        literal(entry.moduleSpecifier) === "vitest/config" &&
        entry.importClause?.namedBindings !== undefined &&
        ts.isNamedImports(entry.importClause.namedBindings) &&
        entry.importClause.namedBindings.elements.some(
          (binding) =>
            binding.name.text === "defineConfig" &&
            binding.propertyName === undefined
        )
    )
      ? config.arguments.at(0)
      : config;

  if (
    !object ||
    !ts.isObjectLiteralExpression(object) ||
    object.properties.length !== 1
  ) {
    return null;
  }

  const [test] = object.properties;

  if (
    test === undefined ||
    !ts.isPropertyAssignment(test) ||
    test.name.getText(ast) !== "test" ||
    !ts.isObjectLiteralExpression(test.initializer) ||
    !test.initializer.properties.every(
      (entry) =>
        ts.isPropertyAssignment(entry) &&
        ts.isIdentifier(entry.name) &&
        !["dir", "includeSource", "projects", "root", "typecheck"].includes(
          entry.name.text
        )
    )
  ) {
    return null;
  }

  return test.initializer;
};

export const inspectSource = (
  file: string,
  cwd: string,
  root: string,
  ast: SourceFile,
  importedValue: ImportValue
) => {
  const { evaluate, evaluateSelector } = evaluator(
    file,
    cwd,
    ast,
    importedValue
  );

  const imports = new Set<string>();
  const runtimeImports = new Set<string>();
  const reads = new Set<string>();
  const configs = new Set<string>();
  const unresolvedConfigs = new Set<string>();
  const unresolvedReads = new Set<string>();
  const unresolvedImports = new Set<string>();
  const filesystemWrappers = new Set<string>();

  const testOptions = flatVitestTestOptions(ast);
  const includedTests = new Set<string>();
  const excludedTestPatterns = new Set<string>();

  const hasInclude =
    testOptions?.properties.some(
      (entry) =>
        ts.isPropertyAssignment(entry) && entry.name.getText(ast) === "include"
    ) ?? false;

  walk(ast, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      /readFile(?:String|Sync)?\(/u.test(node.initializer.getText(ast))
    ) {
      filesystemWrappers.add(node.name.text);
    }
  });

  const expand = (
    reference: string | null,
    bases = [cwd, path.dirname(file), root],
    directories = false,
    selector = false
  ) => {
    if (reference === null || reference.length === 0) {
      return [];
    }

    const input = reference.startsWith("file:")
      ? fileURLToPath(reference)
      : reference;

    return [
      ...new Set(
        bases.flatMap((base) =>
          expandAt(root, base, input, directories, selector)
        )
      ),
    ];
  };

  const selectors = (node: Node) => {
    if (!ts.isPropertyAssignment(node)) {
      return;
    }

    const name = node.name.getText(ast).replaceAll('"', "");
    const flat = node.parent === testOptions;

    if (
      !["include", "setupFiles", "globalSetup", "projects"].includes(name) &&
      !(flat && name === "exclude")
    ) {
      return;
    }

    const nodes = ts.isArrayLiteralExpression(node.initializer)
      ? node.initializer.elements
      : [node.initializer];

    for (const entry of nodes) {
      if (name === "projects" && ts.isObjectLiteralExpression(entry)) {
        continue;
      }

      if (flat && ["include", "exclude"].includes(name)) {
        const reference = evaluateSelector(entry);

        if (reference === null || !supportedVitestSelector(reference)) {
          unresolvedConfigs.add(node.getText(ast));
        } else if (name === "exclude") {
          excludedTestPatterns.add(reference);
        } else {
          for (const loaded of expand(reference, [cwd], false, true)) {
            includedTests.add(loaded);
          }
        }

        continue;
      }

      const reference = evaluate(entry);
      const loadedFiles = expand(reference, [cwd]);

      if (
        reference === null ||
        (loadedFiles.length === 0 && name !== "include")
      ) {
        unresolvedConfigs.add(node.getText(ast));
      }

      for (const loaded of loadedFiles) {
        configs.add(loaded);
      }
    }
  };

  const importReference = (node: Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      const specifier = literal(node.moduleSpecifier);

      if (specifier !== undefined) {
        imports.add(specifier);
      }
    }

    if (
      ts.isCallExpression(node) &&
      ["import", "require"].includes(node.expression.getText(ast))
    ) {
      const [argument] = node.arguments;
      const specifier = argument === undefined ? undefined : literal(argument);

      if (specifier === undefined) {
        const computed =
          argument !== undefined &&
          ts.isPropertyAccessExpression(argument) &&
          ts.isNewExpression(argument.expression)
            ? evaluate(argument)
            : null;

        if (computed === null) {
          unresolvedImports.add(node.getText(ast));
        } else {
          runtimeImports.add(computed);
        }
      } else {
        imports.add(specifier);
      }
    }
  };

  const runtimeReference = (
    node: ts.CallExpression | ts.NewExpression,
    name: string
  ) => {
    if (["URL", "join", "resolve"].includes(name)) {
      return evaluate(node);
    }

    const argument = node.arguments?.[0];

    if (argument !== undefined && ts.isArrayLiteralExpression(argument)) {
      const patterns = argument.elements.map((element) => evaluate(element));

      if (patterns.every((pattern) => pattern !== null)) {
        return `{${patterns.join(",")}}`;
      }
    }

    return evaluate(argument);
  };

  const globLocation = (
    node: ts.CallExpression | ts.NewExpression,
    name: string
  ) => {
    const options = ["glob", "globSync"].includes(name)
      ? node.arguments?.[1]
      : undefined;

    const option =
      options && ts.isObjectLiteralExpression(options)
        ? options.properties.find(
            (property) =>
              ts.isPropertyAssignment(property) &&
              property.name.getText(ast) === "cwd"
          )
        : undefined;

    return {
      declared: option !== undefined,
      base:
        option !== undefined && ts.isPropertyAssignment(option)
          ? evaluate(option.initializer)
          : null,
    };
  };

  const unexpandedRead = (
    name: string,
    reference: string,
    base: string | null,
    expression: string
  ) => {
    if (
      reference.includes("*") ||
      ["URL", "join", "resolve", "glob", "globSync"].includes(name)
    ) {
      return;
    }

    const resolved = reference.startsWith("file:")
      ? fileURLToPath(reference)
      : path.resolve(base ?? cwd, reference);

    if (existsSync(resolved) && resolved.includes("node_modules")) {
      const real = realpathSync(resolved);

      if (!real.includes(`${path.sep}node_modules${path.sep}.pnpm`)) {
        reads.add(real);
      }
    } else if (existsSync(resolved) && statSync(resolved).isDirectory()) {
      unresolvedReads.add(expression);
    } else {
      reads.add(resolved);
    }
  };

  const runtimeCall = (node: Node) => {
    if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) {
      return;
    }

    const name = nameOf(node.expression, ast) ?? "";

    if (
      ![
        "URL",
        "join",
        "resolve",
        "read",
        "readFileSync",
        "readFileString",
        "readFile",
        "readdirSync",
        "readdir",
        "readDirectory",
        "glob",
        "globSync",
      ].includes(name)
    ) {
      return;
    }

    if (
      name === "read" &&
      (!ts.isIdentifier(node.expression) || !filesystemWrappers.has(name))
    ) {
      return;
    }

    const reference = runtimeReference(node, name);

    const { declared, base } = globLocation(node, name);

    if (declared && base === null) {
      unresolvedReads.add(node.getText(ast));

      return;
    }

    if (unknownRead(name, reference)) {
      unresolvedReads.add(node.getText(ast));

      if (reference === null) {
        return;
      }
    }

    const bases = base === null ? undefined : [base];

    const expanded = expand(
      reference,
      bases,
      ["readdirSync", "readdir", "readDirectory"].includes(name)
    );

    for (const read of expanded) {
      reads.add(read);
    }

    if (expanded.length === 0 && reference !== null) {
      unexpandedRead(name, reference, base, node.getText(ast));
    }
  };

  walk(ast, (node) => {
    importReference(node);
    selectors(node);
    runtimeCall(node);
  });

  return {
    imports,
    reads,
    configs,
    unresolvedConfigs,
    unresolvedReads,
    unresolvedImports,
    runtimeImports,
    includedTests,
    selectedTests:
      hasInclude && unresolvedConfigs.size === 0
        ? [...includedTests].filter(
            (selected) =>
              ![...excludedTestPatterns].some((pattern) =>
                path.matchesGlob(path.relative(cwd, selected), pattern)
              )
          )
        : null,
  };
};
