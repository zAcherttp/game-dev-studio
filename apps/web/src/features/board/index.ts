import * as stylex from "@stylexjs/stylex";
import { Option } from "effect";
import { createLazy } from "foldkit/html";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import { WatchCanvas } from "../../client/board/command.js";
import { layout } from "../../client/board/layout.js";
import type { Graph, GraphEdge, GraphNode } from "../../client/board/layout.js";
import { Message } from "../../client/board/message.js";
import type { BoardMessage } from "../../client/board/message.js";
import type { BoardModel } from "../../client/board/model.js";
import { stillOf } from "../../client/board/picker.js";
import { boardStyles } from "./board.stylex.js";
import { boardCopy } from "./copy.js";
import { pickerView } from "./picker.js";

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
  path: string | undefined,
  alt: string
): Html =>
  path === undefined
    ? h.div([h.Class(cls(boardStyles.emptyPreview))], [boardCopy.noPick])
    : h.img([
        h.Src(stillOf(path)),
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

const assetNode = (h: HtmlBuilder<BoardMessage>, node: NodeOf<"asset">) =>
  h.div(
    [h.Key(node.id), h.Class(cls(boardStyles.node)), h.Style(place(node))],
    [
      header(h, "asset"),
      h.div([h.Class(cls(boardStyles.title))], [node.asset.title]),
      h.div(
        [h.Class(cls(boardStyles.meta))],
        [`${Object.keys(node.asset.layers).length} layers`]
      ),
    ]
  );

const layerNode = (h: HtmlBuilder<BoardMessage>, node: NodeOf<"layer">) =>
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
      preview(h, node.pick?.render?.path, `${node.layer.title} pick still`),
    ]
  );

const variantNode = (h: HtmlBuilder<BoardMessage>, node: NodeOf<"variant">) =>
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
        node.variant.render?.path,
        `${node.layer.title} ${node.variant.label} still`
      ),
    ]
  );

const mixNode = (h: HtmlBuilder<BoardMessage>, node: NodeOf<"mix">) =>
  h.div(
    [h.Key(node.id), h.Class(cls(boardStyles.node)), h.Style(place(node))],
    [
      header(h, "mix"),
      h.div([h.Class(cls(boardStyles.title))], [node.asset.title]),
      h.ul(
        [
          h.Class(cls(boardStyles.mixList)),
          h.AriaLabel(`${node.asset.title} mix`),
        ],
        node.layers.map((layer) => {
          const picked = node.asset.layers[layer.id]?.variants.find(
            (variant) => variant.id === node.asset.mix[layer.id]
          );

          return h.li(
            [h.Key(layer.id), h.Class(cls(boardStyles.mixRow))],
            [
              h.span([], [layer.title]),
              h.span(
                [h.Class(cls(boardStyles.mixValue))],
                [picked?.label ?? "-"]
              ),
            ]
          );
        })
      ),
    ]
  );

const nodeView = (h: HtmlBuilder<BoardMessage>, node: GraphNode): Html => {
  if (node.kind === "studio") {
    return studioNode(h, node);
  }

  if (node.kind === "asset") {
    return assetNode(h, node);
  }

  if (node.kind === "layer") {
    return layerNode(h, node);
  }

  if (node.kind === "variant") {
    return variantNode(h, node);
  }

  return mixNode(h, node);
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
      h.span([h.Class(cls(boardStyles.spacer))]),
      h.span([h.Class(cls(boardStyles.hint))], [boardCopy.hint]),
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
  h: HtmlBuilder<BoardMessage>
): Html => {
  const graph = layout(studio, assets);

  return h.div(
    [
      h.Class(cls(boardStyles.graph)),
      h.Style({ height: `${graph.height}px`, width: `${graph.width}px` }),
    ],
    [wires(graph, h), ...graph.nodes.map((node) => nodeView(h, node))]
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
              [lazyGraph(graphView, [model.studio, model.assets, h])]
            ),
          ]
        ),
        Option.match(model.open, {
          onNone: () => h.empty,
          onSome: (open) => pickerView(model, open, h),
        }),
      ]
    ),
    title: boardCopy.title(model.studio.title),
  };
};
