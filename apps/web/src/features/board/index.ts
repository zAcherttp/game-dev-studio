import type { Variant } from "@gds/model";
import * as stylex from "@stylexjs/stylex";
import { Option } from "effect";
import { createLazy } from "foldkit/html";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import { WatchCanvas } from "../../client/board/command.js";
import {
  composeKey,
  drawnPicks,
  pickedTakes,
  takeName,
} from "../../client/board/compose.js";
import { gridStyle } from "../../client/board/grid.js";
import { layout } from "../../client/board/layout.js";
import type { Graph, GraphEdge, GraphNode } from "../../client/board/layout.js";
import { Message } from "../../client/board/message.js";
import type { BoardMessage } from "../../client/board/message.js";
import type { BoardModel } from "../../client/board/model.js";
import { takeKey } from "../../client/board/model.js";
import { mediaSrc } from "../../client/board/picker.js";
import { boardStyles } from "./board.stylex.js";
import { composeView } from "./compose.js";
import { boardCopy, playableCopy } from "./copy.js";
import { pickerView } from "./picker.js";
import { recordButton } from "./playable.js";
import { switcherView } from "./switcher.js";

type VariantValue = typeof Variant.Type;

type NodeOf<Kind extends GraphNode["kind"]> = Extract<
  GraphNode,
  { kind: Kind }
>;

const cls = (...styles: stylex.StyleXStyles[]) =>
  stylex.props(...styles).className ?? "";

const place = (node: GraphNode) => ({
  height: `${node.height}px`,
  left: `${node.x}px`,
  top: `${node.y}px`,
  width: `${node.width}px`,
});

const wireStyle = (edge: GraphEdge) => {
  if (edge.kind === "pick") {
    return boardStyles.picked;
  }

  return edge.kind === "lineage" ? boardStyles.lineage : boardStyles.wire;
};

const wires = (graph: Graph, h: HtmlBuilder<BoardMessage>) => {
  const { height, width } = graph;

  const edges = graph.edges.toSorted(
    (left, right) =>
      Number(left.kind === "pick") - Number(right.kind === "pick")
  );

  return h.svg(
    [
      h.Class(cls(boardStyles.wires)),
      h.Width(String(width)),
      h.Height(String(height)),
      h.ViewBox(`0 0 ${width} ${height}`),
      h.AriaHidden(true),
    ],
    edges.map((edge) =>
      h.path([
        h.Key(edge.id),
        h.D(edge.path),
        h.Class(cls(wireStyle(edge))),
        h.DataAttribute("wire", edge.kind),
      ])
    )
  );
};

const preview = (
  h: HtmlBuilder<BoardMessage>,
  render: VariantValue["render"],
  alt: string
): Html =>
  render === undefined ||
  (render.kind === "playable" && render.still === undefined)
    ? h.div(
        [h.Class(cls(boardStyles.emptyPreview))],
        [render === undefined ? boardCopy.noPick : boardCopy.playable]
      )
    : h.img([
        h.Src(mediaSrc(render.still ?? render.path)),
        h.Alt(alt),
        h.Class(cls(boardStyles.preview)),
        h.Draggable(false),
      ]);

const header = (
  h: HtmlBuilder<BoardMessage>,
  kind: string,
  extra: Html = null
): Html =>
  h.div(
    [h.Class(cls(boardStyles.nodeHeader))],
    [h.span([h.Class(cls(boardStyles.kind))], [kind]), extra]
  );

const studioNode = (h: HtmlBuilder<BoardMessage>, node: NodeOf<"studio">) =>
  h.div(
    [h.Key(node.id), h.Class(cls(boardStyles.node)), h.Style(place(node))],
    [
      header(h, "studio"),
      h.div([h.Class(cls(boardStyles.title))], [node.title]),
    ]
  );

const assetNode = (
  h: HtmlBuilder<BoardMessage>,
  node: NodeOf<"asset">,
  renders: Renders
) => {
  const playable = renders.playableAssets.includes(node.asset.id);

  return h.div(
    [h.Key(node.id), h.Class(cls(boardStyles.node)), h.Style(place(node))],
    [
      header(
        h,
        "asset",
        playable
          ? recordButton(h, renders.recording, node.asset, boardStyles.tool)
          : h.empty
      ),
      h.div([h.Class(cls(boardStyles.title))], [node.asset.title]),
      h.div(
        [h.Class(cls(boardStyles.meta))],
        [
          playable
            ? `${Object.keys(node.asset.layers).length} layers · ${playableCopy.records((node.asset.records ?? []).length)}`
            : `${Object.keys(node.asset.layers).length} layers`,
        ]
      ),
    ]
  );
};

interface Renders {
  readonly solo: BoardModel["solo"];
  readonly composed: BoardModel["composed"];
  readonly recording: BoardModel["recording"];
  readonly playableAssets: readonly string[];
}

const soloOf = (
  renders: Renders,
  asset: string,
  layer: string,
  variant: VariantValue | undefined
) =>
  variant === undefined
    ? undefined
    : (renders.solo[takeKey(asset, layer, variant.id)] ?? variant.render);

const layerNode = (
  h: HtmlBuilder<BoardMessage>,
  node: NodeOf<"layer">,
  renders: Renders
) =>
  h.button(
    [
      h.Key(node.id),
      h.Type("button"),
      h.Class(cls(boardStyles.node, boardStyles.nodeButton, boardStyles.focus)),
      h.Style(place(node)),
      h.AriaLabel(
        `Open ${node.layer.title}, ${
          node.pick === undefined
            ? boardCopy.noPick
            : `picked ${node.pick.label}`
        }`
      ),
      h.OnClick(
        Message.OpenedLayer({ asset: node.asset.id, layer: node.layer.id })
      ),
    ],
    [
      header(
        h,
        "layer",
        h.span([h.Class(cls(boardStyles.meta))], [`${node.count} takes`])
      ),
      h.div([h.Class(cls(boardStyles.title))], [node.layer.title]),
      preview(
        h,
        soloOf(renders, node.asset.id, node.layer.id, node.pick),
        `${node.layer.title} pick still, layer alone`
      ),
    ]
  );

const variantNode = (
  h: HtmlBuilder<BoardMessage>,
  node: NodeOf<"variant">,
  renders: Renders
) =>
  h.button(
    [
      h.Key(node.id),
      h.Type("button"),
      h.Class(cls(boardStyles.node, boardStyles.nodeButton, boardStyles.focus)),
      h.Style(place(node)),
      h.AriaLabel(
        `${node.layer.title} variant ${node.variant.label}${
          node.isPicked ? ", picked" : ""
        }`
      ),
      h.OnClick(
        Message.OpenedLayer({ asset: node.asset.id, layer: node.layer.id })
      ),
    ],
    [
      header(
        h,
        `round ${node.round}`,
        node.isPicked
          ? h.span([h.Class(cls(boardStyles.badge))], ["PICK"])
          : h.span([h.Class(cls(boardStyles.meta))], [node.variant.label])
      ),
      preview(
        h,
        soloOf(renders, node.asset.id, node.layer.id, node.variant),
        `${node.layer.title} ${node.variant.label} still, layer alone`
      ),
    ]
  );

const mixText = (
  picks: Readonly<Record<string, string>>,
  layers: NodeOf<"mix">["layers"],
  loop: VariantValue["render"]
) => {
  if (Object.keys(picks).length === 0) {
    return boardCopy.noPicks;
  }

  if (Object.keys(drawnPicks(picks, layers)).length === 0) {
    return boardCopy.playableMix;
  }

  return loop?.pending ?? boardCopy.composing;
};

const mixNode = (
  h: HtmlBuilder<BoardMessage>,
  node: NodeOf<"mix">,
  renders: Renders
) => {
  const picks = pickedTakes(node.asset, node.layers);
  const loop = renders.composed[composeKey(node.asset.id, picks)];

  return h.div(
    [h.Key(node.id), h.Class(cls(boardStyles.node)), h.Style(place(node))],
    [
      header(h, "mix"),
      h.div([h.Class(cls(boardStyles.title))], [node.asset.title]),
      h.button(
        [
          h.Type("button"),
          h.Class(cls(boardStyles.mixLoop, boardStyles.focus)),
          h.AriaLabel(boardCopy.openCompose(node.asset.title)),
          h.OnClick(Message.OpenedCompose({ asset: node.asset.id })),
        ],
        [
          loop === undefined || loop.pending !== undefined
            ? h.span(
                [h.Class(cls(boardStyles.mixLoopEmpty))],
                [mixText(picks, node.layers, loop)]
              )
            : h.img([
                h.Src(mediaSrc(loop.path)),
                h.Alt(boardCopy.mixLoop(node.asset.title)),
                h.Class(cls(boardStyles.preview)),
                h.Draggable(false),
              ]),
        ]
      ),
      h.ul(
        [
          h.Class(cls(boardStyles.mixList)),
          h.AriaLabel(`${node.asset.title} mix`),
        ],
        node.layers.map((layer) => {
          const picked = node.asset.layers[layer.id]?.variants.find(
            (variant) => variant.id === picks[layer.id]
          );

          return h.li(
            [
              h.Key(layer.id),
              h.Class(
                cls(
                  boardStyles.mixRow,
                  picked === undefined && boardStyles.mixOff
                )
              ),
            ],
            [
              h.span([h.Class(cls(boardStyles.mixName))], [layer.title]),
              h.span(
                [h.Class(cls(boardStyles.mixValue))],
                [
                  picked === undefined
                    ? boardCopy.notInMix
                    : takeName(layer.title, picked),
                ]
              ),
            ]
          );
        })
      ),
    ]
  );
};

const nodeView = (
  h: HtmlBuilder<BoardMessage>,
  node: GraphNode,
  renders: Renders
): Html => {
  if (node.kind === "studio") {
    return studioNode(h, node);
  }

  if (node.kind === "asset") {
    return assetNode(h, node, renders);
  }

  if (node.kind === "layer") {
    return layerNode(h, node, renders);
  }

  if (node.kind === "variant") {
    return variantNode(h, node, renders);
  }

  return mixNode(h, node, renders);
};

const toolButton = (
  h: HtmlBuilder<BoardMessage>,
  label: string,
  name: string,
  message: BoardMessage
) =>
  h.button(
    [
      h.Type("button"),
      h.Class(cls(boardStyles.tool, boardStyles.focus)),
      h.AriaLabel(name),
      h.OnClick(message),
    ],
    [label]
  );

const toolbar = (model: BoardModel, h: HtmlBuilder<BoardMessage>): Html =>
  h.header(
    [h.Class(cls(boardStyles.toolbar))],
    [
      h.h1([h.Class(cls(boardStyles.brand))], [boardCopy.brand]),
      h.span([h.Class(cls(boardStyles.crumb))], [model.studio.title]),
      switcherView(model, h),
      h.span([h.Class(cls(boardStyles.spacer))]),
      Option.isNone(model.open) && model.status.message !== ""
        ? h.span(
            [h.Role("status"), h.Class(cls(boardStyles.hint))],
            [model.status.message]
          )
        : h.span([h.Class(cls(boardStyles.hint))], [boardCopy.hint]),
      toolButton(
        h,
        "−",
        boardCopy.zoomOut,
        Message.ClickedZoom({ factor: 1 / 1.2 })
      ),
      toolButton(
        h,
        "+",
        boardCopy.zoomIn,
        Message.ClickedZoom({ factor: 1.2 })
      ),
      toolButton(h, boardCopy.fit, boardCopy.fit, Message.ClickedFit()),
    ]
  );

const graphView = (
  studio: BoardModel["studio"],
  assets: BoardModel["assets"],
  solo: BoardModel["solo"],
  composed: BoardModel["composed"],
  recording: BoardModel["recording"],
  h: HtmlBuilder<BoardMessage>
): Html => {
  const playableAssets = assets
    .filter((entry) =>
      entry.layers.some((layer) => layer.renderKind === "playable")
    )
    .map((entry) => entry.asset.id);

  const renders = { composed, playableAssets, recording, solo };
  const graph = layout(studio, assets);

  return h.div(
    [
      h.Class(cls(boardStyles.graph)),
      h.Style({ height: `${graph.height}px`, width: `${graph.width}px` }),
    ],
    [wires(graph, h), ...graph.nodes.map((node) => nodeView(h, node, renders))]
  );
};

const lazyGraph = createLazy();

export const view = (
  model: BoardModel,
  h: HtmlBuilder<BoardMessage>
): Document => {
  const { camera } = model;

  return {
    body: h.main(
      [h.Class(cls(boardStyles.root))],
      [
        toolbar(model, h),
        h.div(
          [
            h.Class(cls(boardStyles.canvas)),
            h.Style(gridStyle(camera)),
            h.Role("region"),
            h.AriaLabel(boardCopy.canvasLabel(model.studio.title)),
            h.OnMount(WatchCanvas()),
            h.OnPointerDown((_type, button, screenX, screenY) =>
              button === 0
                ? Option.some(Message.PressedCanvas({ x: screenX, y: screenY }))
                : Option.none()
            ),
            h.OnPointerMove((screenX, screenY) =>
              Option.isSome(model.drag)
                ? Option.some(Message.MovedPointer({ x: screenX, y: screenY }))
                : Option.none()
            ),
            h.OnPointerUp(() => Option.some(Message.ReleasedPointer())),
            h.OnPointerLeave(() =>
              Option.isSome(model.drag)
                ? Option.some(Message.ReleasedPointer())
                : Option.none()
            ),
          ],
          [
            h.div(
              [
                h.Class(cls(boardStyles.world)),
                h.Style({
                  transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
                }),
              ],
              [
                lazyGraph(graphView, [
                  model.studio,
                  model.assets,
                  model.solo,
                  model.composed,
                  model.recording,
                  h,
                ]),
              ]
            ),
          ]
        ),
        Option.match(model.open, {
          onNone: () => h.empty,
          onSome: (open) => pickerView(model, open, h),
        }),
        Option.match(model.compose, {
          onNone: () => h.empty,
          onSome: (compose) => composeView(model, compose, h),
        }),
      ]
    ),
    title: boardCopy.title(model.studio.title),
  };
};
