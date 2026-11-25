import { Pack, Store, UnknownStudio } from "@gds/model";
import { Effect, Layer } from "effect";

export const StudioPack = Layer.effect(
  Pack,
  Effect.gen(function* makeStudioPack() {
    const store = yield* Store;

    return Pack.of({
      get: Effect.fn("StudioPack.get")(function* get(studio: string) {
        const found = (yield* store.listStudios).find(
          (entry) => entry.id === studio
        );

        if (found === undefined) {
          return yield* new UnknownStudio({ studio });
        }

        return found.pack;
      }),
    });
  })
);
