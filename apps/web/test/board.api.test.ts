import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { BoardApi, memoryBoardApi } from "../src/client/board/api.js";
import { fireFlags } from "./fixtures/fire-kit.js";

it.layer(memoryBoardApi(fireFlags.assets))("fixture store", (test) => {
  test.effect(
    "a pick replaces the layer in the mix and keeps every earlier pick",
    () =>
      Effect.gen(function* pickTwice() {
        const api = yield* BoardApi;

        const input = {
          asset: "fire",
          by: "Phát",
          layer: "Streaks",
          studio: "vfx",
        };

        const first = yield* api.pick({
          ...input,
          note: "",
          variant: "Streaks-A",
        });

        const second = yield* api.pick({
          ...input,
          note: "back to D",
          variant: "Streaks-D",
        });

        const before =
          fireFlags.assets[0]?.asset.layers.Streaks?.picks.length ?? 0;

        expect(first.mix.Streaks).toBe("Streaks-A");
        expect(second.mix.Streaks).toBe("Streaks-D");
        expect(
          second.layers.Streaks?.picks.map((pick) => pick.variant).slice(before)
        ).toEqual(["Streaks-A", "Streaks-D"]);
      })
  );

  test.effect(
    "an unknown variant is refused and a round is recorded on a picked layer",
    () =>
      Effect.gen(function* refuseAndRound() {
        const api = yield* BoardApi;

        const refused = yield* api
          .pick({
            asset: "fire",
            by: "Phát",
            layer: "Streaks",
            note: "",
            studio: "vfx",
            variant: "Nope",
          })
          .pipe(Effect.flip);

        const request = yield* api.round({
          asset: "fire",
          axis: "colour",
          layer: "Fireball",
          note: "",
          studio: "vfx",
        });

        expect(refused.message).toContain("Nope");
        expect(request.axis).toBe("colour");
      })
  );
});
