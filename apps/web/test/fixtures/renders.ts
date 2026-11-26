import { Option } from "effect";

import { RenderTake } from "../../src/client/board/command.js";
import { Message } from "../../src/client/board/message.js";
import { openedLayer } from "../../src/client/board/picker.js";
import { fireFlags } from "./fire-kit.js";

export const rendersOf = (layer: string) => {
  const shown = Option.match(
    openedLayer(fireFlags.assets, { asset: "fire", layer }),
    { onNone: () => [], onSome: ({ variants }) => variants }
  );

  return shown.map((variant) => {
    const where = { asset: "fire", layer, variant: variant.id };
    const command = RenderTake({ ...where, studio: "vfx" });

    return variant.render === undefined
      ? ([
          command,
          Message.FailedRender({
            ...where,
            message: "no render in the fixture",
          }),
        ] as const)
      : ([
          command,
          Message.RenderedTake({ ...where, render: variant.render }),
        ] as const);
  });
};
