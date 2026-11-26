import type { AdapterFailed } from "@gds/model";
import { Context, Layer } from "effect";
import type { Duration, Effect } from "effect";

export interface CommandSettings {
  readonly root: string;
  readonly timeout: Duration.Duration;
}

export class CommandConfig extends Context.Service<
  CommandConfig,
  { readonly settings: Effect.Effect<CommandSettings, AdapterFailed> }
>()("@gds/adapter-command/CommandConfig") {
  static readonly layer = (
    settings: Effect.Effect<CommandSettings, AdapterFailed>
  ) => Layer.succeed(CommandConfig, CommandConfig.of({ settings }));
}
