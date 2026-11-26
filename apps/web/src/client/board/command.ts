import { Effect, Schema, Stream } from "effect";
import { Command, Dom, Mount } from "foldkit";

import { BoardApi } from "./api.js";
import { Message } from "./message.js";

export const PickVariant = Command.define("PickVariant", {
  args: {
    asset: Schema.String,
    by: Schema.String,
    layer: Schema.String,
    note: Schema.String,
    studio: Schema.String,
    variant: Schema.String,
  },
  execute: (input) =>
    Effect.gen(function* pickVariant() {
      const api = yield* BoardApi;

      return yield* api.pick(input).pipe(
        Effect.map((asset) => Message.SucceededPick({ asset })),
        Effect.catchTag("BoardApiFailed", (failure) =>
          Effect.succeed(Message.FailedPick({ message: failure.message }))
        )
      );
    }),
  messages: [Message.SucceededPick, Message.FailedPick],
});

export const RequestRound = Command.define("RequestRound", {
  args: {
    asset: Schema.String,
    axis: Schema.String,
    layer: Schema.String,
    note: Schema.String,
    studio: Schema.String,
  },
  execute: (input) =>
    Effect.gen(function* requestRound() {
      const api = yield* BoardApi;

      return yield* api.round(input).pipe(
        Effect.map((request) => Message.SucceededRound({ request })),
        Effect.catchTag("BoardApiFailed", (failure) =>
          Effect.succeed(Message.FailedRound({ message: failure.message }))
        )
      );
    }),
  messages: [Message.SucceededRound, Message.FailedRound],
});

export const RenderTake = Command.define("RenderTake", {
  args: {
    asset: Schema.String,
    layer: Schema.String,
    studio: Schema.String,
    variant: Schema.String,
  },
  execute: (input) =>
    Effect.gen(function* renderTake() {
      const api = yield* BoardApi;

      const where = {
        asset: input.asset,
        layer: input.layer,
        variant: input.variant,
      };

      return yield* api.render(input).pipe(
        Effect.map((render) => Message.RenderedTake({ ...where, render })),
        Effect.catchTag("BoardApiFailed", (failure) =>
          Effect.succeed(
            Message.FailedRender({ ...where, message: failure.message })
          )
        )
      );
    }),
  messages: [Message.RenderedTake, Message.FailedRender],
});

type CanvasMessage =
  | ReturnType<typeof Message.MeasuredCanvas>
  | ReturnType<typeof Message.WheeledCanvas>;

const measure = (element: Element) => {
  const box = element.getBoundingClientRect();

  return Message.MeasuredCanvas({ height: box.height, width: box.width });
};

export const WatchCanvas = Mount.defineStream("WatchCanvas", {
  execute: ({ element }) =>
    Stream.mergeAll(
      [
        Stream.succeed<CanvasMessage>(measure(element)),
        Dom.streamFromEvent({
          mapEvent: (): CanvasMessage => measure(element),
          target: window,
          type: "resize",
        }),
        Dom.streamFromEvent({
          mapEvent: (event: WheelEvent): CanvasMessage => {
            event.preventDefault();
            const box = element.getBoundingClientRect();

            return Message.WheeledCanvas({
              deltaY: event.deltaY,
              x: event.clientX - box.left,
              y: event.clientY - box.top,
            });
          },
          options: { passive: false },
          target: element,
          type: "wheel",
        }),
      ],
      { concurrency: "unbounded" }
    ),
  messages: [Message.MeasuredCanvas, Message.WheeledCanvas],
});
