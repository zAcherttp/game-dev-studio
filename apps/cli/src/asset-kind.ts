import { Source } from "@gds/model";
import { Effect } from "effect";

export const assetKind = (studio: string, asset: string) =>
  Source.use((source) => source.listAssets(studio)).pipe(
    Effect.map((assets) => assets.find(({ id }) => id === asset)?.kind),
    Effect.catchTag("UnknownStudio", () => Effect.void)
  );
