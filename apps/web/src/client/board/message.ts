import { Asset, RoundRequest } from "@gds/model";
import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";

export const Message = defineMessageUnion({
  ChoseVariant: { variant: Schema.String },
  ClickedFit: {},
  ClickedZoom: { factor: Schema.Finite },
  ClosedPicker: {},
  FailedPick: { message: Schema.String },
  FailedRound: { message: Schema.String },
  MeasuredCanvas: { height: Schema.Finite, width: Schema.Finite },
  MovedPointer: { x: Schema.Finite, y: Schema.Finite },
  OpenedLayer: { asset: Schema.String, layer: Schema.String },
  PressedCanvas: { x: Schema.Finite, y: Schema.Finite },
  PressedPickKey: { index: Schema.Int },
  ReleasedPointer: {},
  SubmittedRound: {},
  SucceededPick: { asset: Asset },
  SucceededRound: { request: RoundRequest },
  TickedClock: { elapsed: Schema.Finite },
  UpdatedAxis: { value: Schema.String },
  UpdatedNote: { value: Schema.String },
  UpdatedRoundNote: { value: Schema.String },
  WheeledCanvas: { deltaY: Schema.Finite, x: Schema.Finite, y: Schema.Finite },
});

export type BoardMessage = typeof Message.Type;
