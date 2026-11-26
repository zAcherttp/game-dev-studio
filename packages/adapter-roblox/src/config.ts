import { Context, Layer } from "effect";

export interface RorSettings {
  readonly gameRoot: string;
  readonly ree: string;
  readonly seconds: number;
}

export interface RobloxSettings {
  readonly cache: string;
  readonly easyvfx: string;
  readonly kits: readonly string[];
  readonly python: string;
  readonly ror?: RorSettings | undefined;
  readonly size: readonly [number, number];
  readonly syncBeat?: string | undefined;
  readonly workers: number;
}

export class RobloxConfig extends Context.Service<
  RobloxConfig,
  RobloxSettings
>()("@gds/adapter-roblox/RobloxConfig") {
  static readonly layer = (settings: RobloxSettings) =>
    Layer.succeed(RobloxConfig, settings);
}
