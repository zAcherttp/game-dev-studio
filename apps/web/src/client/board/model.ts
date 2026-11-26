import { Asset, LayerDef, Render, StudioDef } from "@gds/model";
import { Option, Schema } from "effect";

export const BoardAsset = Schema.Struct({
  asset: Asset,
  layers: Schema.Array(LayerDef),
});

export type BoardAssetValue = typeof BoardAsset.Type;

export const CatalogEntry = Schema.Struct({
  id: Schema.String,
  picks: Schema.Int,
  title: Schema.String,
});

export type CatalogEntryValue = typeof CatalogEntry.Type;

export const ComposeState = Schema.Struct({
  asset: Schema.String,
  off: Schema.Array(Schema.String),
});

export type ComposeStateValue = typeof ComposeState.Type;

export const Flags = Schema.Struct({
  assets: Schema.Array(BoardAsset),
  by: Schema.String,
  catalog: Schema.Array(CatalogEntry),
  studio: StudioDef,
});

export type FlagsValue = typeof Flags.Type;

export const Camera = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  zoom: Schema.Finite,
});

export type CameraValue = typeof Camera.Type;

export const Point = Schema.Struct({ x: Schema.Finite, y: Schema.Finite });

export const Viewport = Schema.Struct({
  height: Schema.Finite,
  width: Schema.Finite,
});

export type ViewportValue = typeof Viewport.Type;

export const OpenLayer = Schema.Struct({
  asset: Schema.String,
  layer: Schema.String,
});

export type OpenLayerValue = typeof OpenLayer.Type;

export const Status = Schema.Struct({
  message: Schema.String,
  state: Schema.Literals(["idle", "saving", "done", "failed"]),
});

export const Model = Schema.Struct({
  assetFilter: Schema.String,
  assets: Schema.Array(BoardAsset),
  axis: Schema.String,
  by: Schema.String,
  camera: Camera,
  catalog: Schema.Array(CatalogEntry),
  clock: Schema.Finite,
  compose: Schema.Option(ComposeState),
  composed: Schema.Record(Schema.String, Render),
  drag: Schema.Option(Point),
  fitted: Schema.Boolean,
  note: Schema.String,
  open: Schema.Option(OpenLayer),
  pickerMode: Schema.Literals(["mix", "solo"]),
  rendering: Schema.Array(Schema.String),
  roundNote: Schema.String,
  solo: Schema.Record(Schema.String, Render),
  status: Status,
  studio: StudioDef,
  switcherOpen: Schema.Boolean,
  viewport: Viewport,
});

export type BoardModel = typeof Model.Type;

export const defaultViewport: ViewportValue = { height: 720, width: 1280 };

export const takeKey = (asset: string, layer: string, variant: string) =>
  `${asset}/${layer}/${variant}`;

export const idleStatus = { message: "", state: "idle" } as const;

export const initialModel = (flags: FlagsValue): BoardModel => ({
  assetFilter: "",
  assets: flags.assets,
  axis: "",
  by: flags.by,
  camera: { x: 0, y: 0, zoom: 1 },
  catalog: flags.catalog,
  clock: 0,
  compose: Option.none(),
  composed: {},
  drag: Option.none(),
  fitted: false,
  note: "",
  open: Option.none(),
  pickerMode: "mix",
  rendering: [],
  roundNote: "",
  solo: {},
  status: idleStatus,
  studio: flags.studio,
  switcherOpen: false,
  viewport: defaultViewport,
});
