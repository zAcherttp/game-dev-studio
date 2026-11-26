import { AdapterFailed } from "@gds/model";
import { Config, Context, Effect, Layer, Option } from "effect";

const unset = new AdapterFailed({
  adapter: "store",
  message:
    "GDS_GAME is unset, so the dev studio has no game checkout to read studios from or write picks into. Fix: set `GDS_GAME` to the game checkout's path in `.env.local`, or export it before running the CLI.",
});

export class GameFolder extends Context.Service<
  GameFolder,
  { readonly root: Effect.Effect<string, AdapterFailed> }
>()("@gds/store/GameFolder") {
  static readonly layer = Layer.effect(
    GameFolder,
    Effect.gen(function* readGameFolder() {
      const configured = yield* Config.option(
        Config.NonEmptyString("GDS_GAME")
      ).pipe(Effect.orElseSucceed(() => Option.none<string>()));

      return GameFolder.of({
        root: Effect.fromOption(configured).pipe(Effect.mapError(() => unset)),
      });
    })
  );

  static readonly at = (root: string) =>
    Layer.succeed(GameFolder, GameFolder.of({ root: Effect.succeed(root) }));
}
