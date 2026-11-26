import { Asset, Render, RoundRequest } from "@gds/model";
import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";

export const Message = defineMessageUnion({
  ChoseComposeVariant: { layer: Schema.String, variant: Schema.String },
  ChoseMixCamera: { camera: Schema.String },
  ChoseVariant: { variant: Schema.String },
  ClickedFit: {},
  ClickedZoom: { factor: Schema.Finite },
  ClosedCamera: {},
  ClosedCompose: {},
  ClosedPicker: {},
  FailedCompose: { key: Schema.String, message: Schema.String },
  FailedPick: { message: Schema.String },
  FailedRender: {
    asset: Schema.String,
    layer: Schema.String,
    message: Schema.String,
    variant: Schema.String,
  },
  FailedRound: { message: Schema.String },
  LoadedAsset: { asset: Asset },
  MeasuredCanvas: { height: Schema.Finite, width: Schema.Finite },
  MovedPointer: { x: Schema.Finite, y: Schema.Finite },
  OpenedCamera: { camera: Schema.String, layer: Schema.String },
  OpenedCompose: { asset: Schema.String },
  OpenedLayer: { asset: Schema.String, layer: Schema.String },
  PressedCanvas: { x: Schema.Finite, y: Schema.Finite },
  PressedPickKey: { index: Schema.Int },
  ReleasedPointer: {},
  RenderedComposed: { key: Schema.String, render: Render },
  RenderedSolo: {
    asset: Schema.String,
    layer: Schema.String,
    render: Render,
    variant: Schema.String,
  },
  RenderedTake: {
    asset: Schema.String,
    layer: Schema.String,
    render: Render,
    variant: Schema.String,
  },
  SubmittedRound: {},
  SwitchedPickerMode: { mode: Schema.Literals(["mix", "solo"]) },
  SucceededPick: { asset: Asset },
  SucceededRound: { request: RoundRequest },
  TickedClock: { elapsed: Schema.Finite },
  ToggledSwitcher: {},
  UpdatedAssetFilter: { value: Schema.String },
  UpdatedAxis: { value: Schema.String },
  UpdatedNote: { value: Schema.String },
  UpdatedRoundNote: { value: Schema.String },
  WheeledCanvas: { deltaY: Schema.Finite, x: Schema.Finite, y: Schema.Finite },
});

export type BoardMessage = typeof Message.Type;
