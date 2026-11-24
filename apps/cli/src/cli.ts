#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Approval } from "@gds/capability";
import { Console, Effect, Layer } from "effect";

import { runCommand } from "./command.js";

const [first, ...rest] = process.argv.slice(2);

const args = first === "--" ? rest : process.argv.slice(2);

const program = runCommand(args).pipe(
  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Oxlint mistakes this Effect handler for an async Promise callback.
  Effect.catchTag("NotBuilt", (error) =>
    Console.error(error.message).pipe(Effect.andThen(Effect.fail(error)))
  ),
  Effect.provide(Layer.mergeAll(NodeServices.layer, Approval.denyAll))
);

NodeRuntime.runMain(program);
