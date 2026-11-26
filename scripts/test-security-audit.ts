// @effect-diagnostics-next-line nodeBuiltinImport:off -- This runner hands the vendored skill tests to node:test as a child process.
import { spawnSync } from "node:child_process";

const noFollowUnavailable = process.platform === "win32";

const result = spawnSync(
  process.execPath,
  [
    "--test",
    ...(noFollowUnavailable
      ? ["--test-skip-pattern=(^CLI |through the CLI)"]
      : []),
    "skills/security-audit/validate-coverage-ledger.test.cjs",
    "skills/security-audit/validate-findings.test.cjs",
  ],
  { stdio: "inherit" }
);

process.exitCode = result.status ?? 1;
