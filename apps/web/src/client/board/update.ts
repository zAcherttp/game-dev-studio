import { Option } from "effect";
import type { Update } from "foldkit";
import { modifyFields } from "foldkit/struct";

import type { BoardApi } from "./api.js";
import {
  LoadAsset,
  PickVariant,
  RenderComposed,
  RenderSolo,
  RenderTake,
  RequestRound,
} from "./command.js";
import {
  composeKey,
  failingGates,
  gateValue,
  isWaiting,
  pickedTakes,
} from "./compose.js";
import type { Picks } from "./compose.js";
import { fit, layout, nodeId, panTo, shownTakes, zoomAt } from "./layout.js";
import { Message } from "./message.js";
import type { BoardMessage } from "./message.js";
import { idleStatus, takeKey } from "./model.js";
import type { BoardAssetValue, BoardModel, CameraValue } from "./model.js";
import { openedLayer } from "./picker.js";

type UpdateReturn = Update.Return<BoardModel, BoardMessage, BoardApi>;

const MAX_FRAME_MS = 100;

const WHEEL_SENSITIVITY = 0.0015;

export const graphOf = (model: BoardModel) =>
  layout(model.studio, model.assets);

const fitted = (model: BoardModel) => fit(graphOf(model), model.viewport);

const sameCamera = (left: CameraValue, right: CameraValue) =>
  Math.abs(left.x - right.x) < 0.5 &&
  Math.abs(left.y - right.y) < 0.5 &&
  Math.abs(left.zoom - right.zoom) < 1e-6;

const centre = (model: BoardModel) => ({
  x: model.viewport.width / 2,
  y: model.viewport.height / 2,
});

const variantOf = (
  model: BoardModel,
  where: { readonly asset: string; readonly layer: string },
  variant: string
) =>
  model.assets
    .find((entry) => entry.asset.id === where.asset)
    ?.asset.layers[where.layer]?.variants.find(({ id }) => id === variant);

const refusal = (label: string, failing: ReturnType<typeof failingGates>) =>
  `${label} fails ${failing
    .map((gate) => `${gate.id} (${gateValue(gate.value)})`)
    .join(
      ", "
    )}, so it cannot be picked. Fix: make a variant that passes, or fix the gate, and render again.`;

const pickOn = (
  model: BoardModel,
  where: { readonly asset: string; readonly layer: string },
  variant: string
): UpdateReturn => {
  if (model.status.state === "saving") {
    return { model };
  }

  const found = variantOf(model, where, variant);
  const failing = found === undefined ? [] : failingGates(found);

  if (found !== undefined && failing.length > 0) {
    return {
      model: modifyFields(model, {
        status: () => ({
          message: refusal(found.label, failing),
          state: "failed" as const,
        }),
      }),
    };
  }

  return {
    commands: [
      PickVariant({
        asset: where.asset,
        by: model.by,
        layer: where.layer,
        note: model.note.trim(),
        studio: model.studio.id,
        variant,
      }),
    ],
    model: modifyFields(model, {
      status: () => ({ message: "", state: "saving" as const }),
    }),
  };
};

const pick = (model: BoardModel, variant: string): UpdateReturn =>
  Option.match(model.open, {
    onNone: () => ({ model }),
    onSome: (open) => pickOn(model, open, variant),
  });

const pickByKey = (model: BoardModel, index: number): UpdateReturn =>
  Option.match(
    model.open.pipe(Option.flatMap((open) => openedLayer(model.assets, open))),
    {
      onNone: () => ({ model }),
      onSome: ({ variants }) => {
        const variant = variants[index - 1];

        return variant === undefined ? { model } : pick(model, variant.id);
      },
    }
  );

const withRender = (
  assets: readonly BoardAssetValue[],
  where: {
    readonly asset: string;
    readonly layer: string;
    readonly variant: string;
  },
  render: NonNullable<
    BoardAssetValue["asset"]["layers"][string]["variants"][number]["render"]
  >
): readonly BoardAssetValue[] =>
  assets.map((entry) => {
    const layer = entry.asset.layers[where.layer];

    if (entry.asset.id !== where.asset || layer === undefined) {
      return entry;
    }

    return {
      ...entry,
      asset: {
        ...entry.asset,
        layers: {
          ...entry.asset.layers,
          [where.layer]: {
            ...layer,
            variants: layer.variants.map((variant) =>
              variant.id === where.variant ? { ...variant, render } : variant
            ),
          },
        },
      },
    };
  });

const openLayer = (
  model: BoardModel,
  asset: string,
  layer: string
): UpdateReturn => {
  const takes = Option.match(openedLayer(model.assets, { asset, layer }), {
    onNone: () => [],
    onSome: ({ variants }) => variants,
  });

  const keys = takes.map((take) => takeKey(asset, layer, take.id));

  return {
    commands: takes.map((take) =>
      RenderTake({ asset, layer, studio: model.studio.id, variant: take.id })
    ),
    model: modifyFields(model, {
      axis: () => "",
      clock: () => 0,
      drag: () => Option.none(),
      note: () => "",
      camera: (camera) => {
        const node = graphOf(model).nodes.find(
          (candidate) => candidate.id === nodeId.layer(asset, layer)
        );

        return node === undefined
          ? camera
          : panTo(camera, node, model.viewport);
      },
      open: () => Option.some({ asset, layer }),
      rendering: (current) => [
        ...current.filter((key) => !keys.includes(key)),
        ...keys,
      ],
      roundNote: () => "",
      status: () => idleStatus,
    }),
  };
};

const soloMissing = (
  model: BoardModel,
  asset: string,
  layer: string,
  takes: readonly string[]
) =>
  takes.flatMap((take) =>
    model.solo[takeKey(asset, layer, take)] === undefined
      ? [RenderSolo({ asset, layer, studio: model.studio.id, variant: take })]
      : []
  );

const composedMissing = (model: BoardModel, asset: string, picks: Picks) => {
  const key = composeKey(asset, picks);
  const known = model.composed[key];

  return Object.keys(picks).length === 0 ||
    (known !== undefined && !isWaiting(known))
    ? []
    : [RenderComposed({ asset, key, studio: model.studio.id })];
};

const takesMissing = (model: BoardModel, asset: string) => {
  const entry = model.assets.find((candidate) => candidate.asset.id === asset);

  return (entry?.layers ?? []).flatMap((layer) =>
    (entry?.asset.layers[layer.id]?.variants ?? []).flatMap((variant) =>
      (variant.render !== undefined && !isWaiting(variant.render)) ||
      model.rendering.includes(takeKey(asset, layer.id, variant.id))
        ? []
        : [
            {
              command: RenderTake({
                asset,
                layer: layer.id,
                studio: model.studio.id,
                variant: variant.id,
              }),
              key: takeKey(asset, layer.id, variant.id),
            },
          ]
    )
  );
};

const allPicks = (model: BoardModel, asset: string): Picks => {
  const entry = model.assets.find((candidate) => candidate.asset.id === asset);

  return entry === undefined ? {} : pickedTakes(entry.asset, entry.layers);
};

const withGates = (
  shown: BoardAssetValue["asset"],
  loaded: BoardAssetValue["asset"]
): BoardAssetValue["asset"] => ({
  ...shown,
  layers: Object.fromEntries(
    Object.entries(shown.layers).map(([id, layer]) => [
      id,
      {
        ...layer,
        variants: layer.variants.map((variant) => {
          const gates = loaded.layers[id]?.variants.find(
            (candidate) => candidate.id === variant.id
          )?.gates;

          return gates === undefined ? variant : { ...variant, gates };
        }),
      },
    ])
  ),
});

const afterTake = (model: BoardModel, asset: string): UpdateReturn => {
  const composing = Option.exists(
    model.compose,
    (compose) => compose.asset === asset
  );

  const settled = !model.rendering.some((key) => key.startsWith(`${asset}/`));

  return composing && settled
    ? { commands: [LoadAsset({ asset, studio: model.studio.id })], model }
    : { model };
};

export const prerenderBoard = (model: BoardModel) =>
  model.assets.flatMap(({ asset, layers }) => [
    ...layers.flatMap((layer) =>
      soloMissing(
        model,
        asset.id,
        layer.id,
        shownTakes(
          asset.layers[layer.id]?.variants ?? [],
          asset.mix[layer.id]
        ).map(({ id }) => id)
      )
    ),
    ...composedMissing(model, asset.id, pickedTakes(asset, layers)),
  ]);

const round = (model: BoardModel): UpdateReturn =>
  Option.match(model.open, {
    onNone: () => ({ model }),
    onSome: (open) => {
      const axis = model.axis.trim();

      if (axis === "") {
        return {
          model: modifyFields(model, {
            status: () => ({
              message: "Name the axis the next round should explore.",
              state: "failed" as const,
            }),
          }),
        };
      }

      return {
        commands: [
          RequestRound({
            asset: open.asset,
            axis,
            layer: open.layer,
            note: model.roundNote.trim(),
            studio: model.studio.id,
          }),
        ],
        model: modifyFields(model, {
          status: () => ({ message: "", state: "saving" as const }),
        }),
      };
    },
  });

export const update = (
  model: BoardModel,
  message: BoardMessage
): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ChoseVariant: ({ variant }) => pick(model, variant),
    ClickedFit: () => ({
      model: modifyFields(model, { camera: () => fitted(model) }),
    }),
    ClickedZoom: ({ factor }) => ({
      model: modifyFields(model, {
        camera: (camera) => zoomAt(camera, factor, centre(model)),
      }),
    }),
    ClosedPicker: () => ({
      model: modifyFields(model, {
        open: () => Option.none(),
        status: () => idleStatus,
      }),
    }),
    FailedPick: ({ message: reason }) => ({
      model: modifyFields(model, {
        status: () => ({ message: reason, state: "failed" as const }),
      }),
    }),
    FailedRender: ({ asset, layer, message: reason, variant }) =>
      afterTake(
        modifyFields(model, {
          rendering: (current) =>
            current.filter((key) => key !== takeKey(asset, layer, variant)),
          status: () => ({
            message: `Take ${variant} did not render. ${reason}`,
            state: "failed" as const,
          }),
        }),
        asset
      ),
    FailedRound: ({ message: reason }) => ({
      model: modifyFields(model, {
        status: () => ({ message: reason, state: "failed" as const }),
      }),
    }),
    MeasuredCanvas: ({ height, width }) => {
      const viewport = { height, width };
      const measured = { ...model, viewport };

      const untouched =
        !model.fitted || sameCamera(model.camera, fitted(model));

      return {
        model: untouched
          ? { ...measured, camera: fitted(measured), fitted: true }
          : measured,
      };
    },
    MovedPointer: ({ x, y }) =>
      Option.match(model.drag, {
        onNone: () => ({ model }),
        onSome: (from) => ({
          model: modifyFields(model, {
            camera: (camera) =>
              modifyFields(camera, {
                x: (left) => left + x - from.x,
                y: (top) => top + y - from.y,
              }),
            drag: () => Option.some({ x, y }),
          }),
        }),
      }),
    OpenedLayer: ({ asset, layer }) => openLayer(model, asset, layer),
    PressedCanvas: ({ x, y }) => ({
      model: modifyFields(model, { drag: () => Option.some({ x, y }) }),
    }),
    PressedPickKey: ({ index }) => pickByKey(model, index),
    ReleasedPointer: () => ({
      model: modifyFields(model, { drag: () => Option.none() }),
    }),
    RenderedTake: ({ asset, layer, render, variant }) =>
      afterTake(
        modifyFields(model, {
          assets: (assets) =>
            withRender(assets, { asset, layer, variant }, render),
          rendering: (current) =>
            current.filter((key) => key !== takeKey(asset, layer, variant)),
        }),
        asset
      ),
    LoadedAsset: ({ asset }) => ({
      model: modifyFields(model, {
        assets: (assets) =>
          assets.map((entry) =>
            entry.asset.id === asset.id
              ? { ...entry, asset: withGates(entry.asset, asset) }
              : entry
          ),
      }),
    }),
    SubmittedRound: () => round(model),
    SucceededPick: ({ asset }) => {
      const next = modifyFields(model, {
        assets: (assets) =>
          assets.map((entry) =>
            entry.asset.id === asset.id ? { ...entry, asset } : entry
          ),
        note: () => "",
        status: () => ({
          message: "Picked. The mix now uses it.",
          state: "done" as const,
        }),
      });

      const before = model.assets.find((entry) => entry.asset.id === asset.id);

      const changed = Object.entries(asset.mix).filter(
        ([layer, take]) => before?.asset.mix[layer] !== take
      );

      const composing = Option.exists(
        model.compose,
        (compose) => compose.asset === asset.id
      );

      return {
        commands: [
          ...(composing
            ? []
            : changed.flatMap(([layer, take]) =>
                soloMissing(next, asset.id, layer, [take])
              )),
          ...composedMissing(next, asset.id, allPicks(next, asset.id)),
        ],
        model: next,
      };
    },
    SwitchedPickerMode: ({ mode }) => {
      const next = modifyFields(model, { pickerMode: () => mode });

      const solos = Option.match(
        model.open.pipe(
          Option.flatMap((open) =>
            openedLayer(model.assets, open).pipe(
              Option.map((view) => ({ open, view }))
            )
          )
        ),
        {
          onNone: () => [],
          onSome: ({ open, view }) =>
            soloMissing(
              model,
              open.asset,
              open.layer,
              view.variants.map(({ id }) => id)
            ),
        }
      );

      return { commands: mode === "solo" ? solos : [], model: next };
    },
    OpenedCompose: ({ asset }) => {
      const takes = takesMissing(model, asset);

      return {
        commands: [
          ...composedMissing(model, asset, allPicks(model, asset)),
          ...takes.map(({ command }) => command),
        ],
        model: modifyFields(model, {
          compose: () =>
            Option.some({
              asset,
              compare: Option.none(),
              mixCamera: Option.none(),
            }),
          rendering: (current) => [...current, ...takes.map(({ key }) => key)],
          status: () => idleStatus,
        }),
      };
    },
    ChoseComposeVariant: ({ layer, variant }) =>
      Option.match(model.compose, {
        onNone: () => ({ model }),
        onSome: ({ asset }) =>
          model.assets.find((entry) => entry.asset.id === asset)?.asset.mix[
            layer
          ] === variant
            ? { model }
            : pickOn(model, { asset, layer }, variant),
      }),
    ChoseMixCamera: ({ camera }) => ({
      model: modifyFields(model, {
        compose: (compose) =>
          compose.pipe(
            Option.map((current) => ({
              ...current,
              mixCamera: Option.some(camera),
            }))
          ),
      }),
    }),
    OpenedCamera: ({ camera, layer }) => ({
      model: modifyFields(model, {
        compose: (compose) =>
          compose.pipe(
            Option.map((current) => ({
              ...current,
              compare: Option.some({ camera, layer }),
            }))
          ),
      }),
    }),
    ClosedCamera: () => ({
      model: modifyFields(model, {
        compose: (compose) =>
          compose.pipe(
            Option.map((current) => ({
              ...current,
              compare: Option.none(),
            }))
          ),
      }),
    }),
    ClosedCompose: () => ({
      model: modifyFields(model, { compose: () => Option.none() }),
    }),
    RenderedSolo: ({ asset, layer, render, variant }) => ({
      model: modifyFields(model, {
        solo: (solo) => ({ ...solo, [takeKey(asset, layer, variant)]: render }),
      }),
    }),
    RenderedComposed: ({ key, render }) => ({
      model: modifyFields(model, {
        composed: (composed) => ({ ...composed, [key]: render }),
      }),
    }),
    FailedCompose: ({ message: reason }) => ({
      model: modifyFields(model, {
        status: () => ({
          message: `The composed view did not render. ${reason}`,
          state: "failed" as const,
        }),
      }),
    }),
    SucceededRound: ({ request }) => ({
      model: modifyFields(model, {
        axis: () => "",
        roundNote: () => "",
        status: () => ({
          message: `Round asked: more along ${request.axis}.`,
          state: "done" as const,
        }),
      }),
    }),
    TickedClock: ({ elapsed }) => ({
      model: modifyFields(model, {
        clock: (clock) => clock + Math.min(MAX_FRAME_MS, Math.max(0, elapsed)),
      }),
    }),
    ToggledSwitcher: () => ({
      model: modifyFields(model, {
        assetFilter: () => "",
        switcherOpen: (open) => !open,
      }),
    }),
    UpdatedAssetFilter: ({ value }) => ({
      model: modifyFields(model, { assetFilter: () => value }),
    }),
    UpdatedAxis: ({ value }) => ({
      model: modifyFields(model, { axis: () => value }),
    }),
    UpdatedNote: ({ value }) => ({
      model: modifyFields(model, { note: () => value }),
    }),
    UpdatedRoundNote: ({ value }) => ({
      model: modifyFields(model, { roundNote: () => value }),
    }),
    WheeledCanvas: ({ deltaY, x, y }) => ({
      model: modifyFields(model, {
        camera: (camera) =>
          zoomAt(camera, Math.exp(-deltaY * WHEEL_SENSITIVITY), { x, y }),
      }),
    }),
  });
