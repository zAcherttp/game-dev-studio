// @effect-diagnostics-next-line nodeBuiltinImport:off -- Root has no @effect/platform-node dependency; this adapter owns the coverage CLI process boundary.
import { execFileSync } from "node:child_process";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- Root has no @effect/platform-node dependency; this adapter owns coverage and fixture filesystem operations.
import * as fs from "node:fs";
import os from "node:os";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- Root has no @effect/platform-node dependency; this adapter owns platform path resolution.
import nodePath from "node:path";
import { fileURLToPath as nodeFileURLToPath, pathToFileURL } from "node:url";

const {
  existsSync,
  globSync: nodeGlobSync,
  mkdirSync,
  mkdtempSync: nodeMkdtempSync,
  readFileSync,
  realpathSync: nodeRealpathSync,
  rmSync,
  statSync,
  writeFileSync,
} = fs;

const slash = (value: string) => value.replaceAll("\\", "/");

const path: typeof nodePath =
  nodePath.sep === "/"
    ? nodePath
    : {
        ...nodePath,
        basename: (...parts) => slash(nodePath.basename(...parts)),
        dirname: (value) => slash(nodePath.dirname(value)),
        join: (...parts) => slash(nodePath.join(...parts)),
        normalize: (value) => slash(nodePath.normalize(value)),
        relative: (from, to) => slash(nodePath.relative(from, to)),
        resolve: (...parts) => slash(nodePath.resolve(...parts)),
        sep: "/",
      };

const fileURLToPath = (url: string | URL) => slash(nodeFileURLToPath(url));

const realpathSync = (value: string) => slash(nodeRealpathSync(value));

const mkdtempSync = (prefix: string) => slash(nodeMkdtempSync(prefix));

const globSync = (
  pattern: string | readonly string[],
  options: { readonly cwd?: string; readonly exclude?: readonly string[] } = {}
) => nodeGlobSync(pattern, options).map(slash);

export {
  execFileSync,
  existsSync,
  fileURLToPath,
  globSync,
  mkdirSync,
  mkdtempSync,
  os,
  path,
  pathToFileURL,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
};
