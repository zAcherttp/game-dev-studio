import { Source, UnknownLayer, UnknownStudio } from "@gds/model";
import { Effect, Layer } from "effect";

import { EasyvfxKits } from "./easyvfx-kits.js";
import { takeLayers, takesOfLayer } from "./kit.js";
import type { KitTake } from "./kit.js";

const onlyStudio = (studio: string, asked: string) =>
  asked === studio
    ? Effect.void
    : Effect.fail(new UnknownStudio({ studio: asked }));

const takeVariant = (layer: string, id: string, take: typeof KitTake.Type) => {
  const variant = {
    generator: "easyvfx.kit",
    id,
    label: `${layer} ${id}`,
    layer,
    params: { count: take.count, layers: takeLayers(take) },
  };

  return take.note === "" ? variant : { ...variant, note: take.note };
};

export const easyvfxSource = (studio: string) =>
  Layer.effect(
    Source,
    Effect.gen(function* makeEasyvfxSource() {
      const kits = yield* EasyvfxKits;

      return Source.of({
        layersOf: (asked, asset) =>
          onlyStudio(studio, asked).pipe(
            Effect.andThen(kits.kit(asked, asset)),
            Effect.map((kit) =>
              kit.layers.map((layer, order) => ({
                id: layer.name,
                order,
                renderKind: "gif" as const,
                title: layer.name,
              }))
            )
          ),
        listAssets: (asked) =>
          onlyStudio(studio, asked).pipe(
            Effect.andThen(kits.list),
            Effect.map((listing) =>
              Object.entries(listing).map(([id, kit]) => ({
                id,
                title: `${id} (${kit.preset})`,
              }))
            )
          ),
        takesOf: (asked, asset, layer) =>
          onlyStudio(studio, asked).pipe(
            Effect.andThen(kits.kit(asked, asset)),
            Effect.flatMap((kit) => {
              const found = kit.layers.find((entry) => entry.name === layer);

              return found === undefined
                ? Effect.fail(new UnknownLayer({ asset, layer, studio }))
                : Effect.succeed(
                    Object.entries(takesOfLayer(found)).map(([id, take]) =>
                      takeVariant(layer, id, take)
                    )
                  );
            })
          ),
      });
    })
  );
