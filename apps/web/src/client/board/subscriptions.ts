import { Option } from "effect";
import { Dom, Subscription } from "foldkit";

import type { BoardApi } from "./api.js";
import { Message } from "./message.js";
import type { BoardMessage } from "./message.js";
import type { BoardModel } from "./model.js";
import { MAX_COLUMNS } from "./picker.js";

const pickKeys = Array.from({ length: MAX_COLUMNS }, (_, index) => ({
  keys: String(index + 1),
  mapEvent: (): BoardMessage => Message.PressedPickKey({ index: index + 1 }),
  whileTyping: "Suppress" as const,
}));

export const subscriptions = Subscription.make<
  BoardModel,
  BoardMessage,
  BoardApi
>()(() => ({
  clock: Subscription.animationFrameEntry<BoardModel, BoardMessage>({
    isActive: (model) => Option.isSome(model.open),
    toMessage: (elapsed) => Message.TickedClock({ elapsed }),
  }),
  keys: Subscription.persistentEntry(
    Dom.streamFromKeyBindings({
      bindings: [
        ...pickKeys,
        {
          keys: "Escape",
          mapEvent: (): BoardMessage => Message.ClosedPicker(),
          whileTyping: "Allow" as const,
        },
      ],
    })
  ),
}));
