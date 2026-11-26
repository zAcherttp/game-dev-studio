import { defineContract } from "@gds/capability/contract";
import { Schema } from "effect";

import { AdapterFailed } from "./adapter-failed.js";
import { Asset, AssetSummary } from "./asset.js";
import { LayerBusy } from "./layer-busy.js";
import { NoPick } from "./no-pick.js";
import { NotBuilt } from "./not-built.js";
import { CheckShot, RoundRequest } from "./round.js";
import { LayerDef, PackDef, StudioDef } from "./studio.js";
import { UnknownAsset } from "./unknown-asset.js";
import { UnknownLayer } from "./unknown-layer.js";
import { UnknownStudio } from "./unknown-studio.js";
import { UnknownVariant } from "./unknown-variant.js";
import { Render, Variant } from "./variant.js";

const readOnly = { idempotent: true, readOnly: true } as const;

const studioField = Schema.String.annotate({
  description: "Studio id, such as vfx.",
});

const assetField = Schema.String.annotate({
  description: "Asset id inside the studio.",
});

const layerField = Schema.String.annotate({
  description: "Layer id inside the asset.",
});

const assetFailure = Schema.Union([
  NotBuilt,
  UnknownStudio,
  UnknownAsset,
  AdapterFailed,
]);

export const listStudiosContract = defineContract("listStudios", {
  annotations: readOnly,
  description:
    "List every studio the dev studio can open, with its layers, render kinds, gates and context pack.",
  failure: Schema.Union([NotBuilt, AdapterFailed]),
  input: Schema.Struct({}),
  output: Schema.Struct({ studios: Schema.Array(StudioDef) }),
});

export const listAssetsContract = defineContract("listAssets", {
  annotations: readOnly,
  description:
    "List every asset a studio has picks for, by id and title, sorted by id.",
  failure: Schema.Union([NotBuilt, UnknownStudio, AdapterFailed]),
  input: Schema.Struct({ studio: studioField }),
  output: Schema.Struct({ assets: Schema.Array(AssetSummary) }),
});

export const layersOfContract = defineContract("layersOf", {
  annotations: readOnly,
  description:
    "List an asset's layers in its own order, with titles and render kinds. A kit that names its own layers gives them here; the studio's layers are the default for an asset that does not.",
  failure: Schema.Union([NotBuilt, UnknownStudio, UnknownAsset, AdapterFailed]),
  input: Schema.Struct({ asset: assetField, studio: studioField }),
  output: Schema.Struct({ layers: Schema.Array(LayerDef) }),
});

export const getAssetContract = defineContract("getAsset", {
  annotations: readOnly,
  description:
    "Read one asset: every layer's variants and picks, and the current mix.",
  failure: assetFailure,
  input: Schema.Struct({ asset: assetField, studio: studioField }),
  output: Asset,
});

export const addVariantsContract = defineContract("addVariants", {
  description:
    "Add variants an agent made to one layer of an asset. The layer becomes ready to pick.",
  failure: Schema.Union([
    NotBuilt,
    UnknownStudio,
    UnknownAsset,
    UnknownLayer,
    AdapterFailed,
  ]),
  input: Schema.Struct({
    asset: assetField,
    layer: layerField,
    studio: studioField,
    variants: Schema.Array(Variant),
  }),
  output: Asset,
});

export const renderContract = defineContract("render", {
  annotations: { idempotent: true },
  description:
    "Render one variant drawn on top of the mix's other layers, through the studio's renderer.",
  failure: Schema.Union([
    NotBuilt,
    UnknownStudio,
    UnknownAsset,
    UnknownLayer,
    UnknownVariant,
    AdapterFailed,
  ]),
  input: Schema.Struct({
    asset: assetField,
    layer: layerField,
    studio: studioField,
    variant: Schema.String,
  }),
  output: Render,
});

export const pickContract = defineContract("pick", {
  description:
    "Pick one variant for a layer. It replaces that layer's earlier pick in the mix; the history keeps both. No pick while the layer is making.",
  failure: Schema.Union([
    NotBuilt,
    UnknownStudio,
    UnknownAsset,
    UnknownLayer,
    UnknownVariant,
    LayerBusy,
    AdapterFailed,
  ]),
  input: Schema.Struct({
    asset: assetField,
    by: Schema.String.annotate({ description: "Who picked." }),
    layer: layerField,
    note: Schema.String,
    studio: studioField,
    variant: Schema.String,
  }),
  output: Asset,
});

export const roundContract = defineContract("round", {
  description:
    "Record a request for another round of variants on a picked layer. The calling agent makes them and calls addVariants.",
  failure: Schema.Union([
    NotBuilt,
    UnknownStudio,
    UnknownAsset,
    UnknownLayer,
    NoPick,
    AdapterFailed,
  ]),
  input: Schema.Struct({
    asset: assetField,
    axis: Schema.String,
    layer: layerField,
    note: Schema.String,
    studio: studioField,
  }),
  output: RoundRequest,
});

export const getPackContract = defineContract("getPack", {
  annotations: readOnly,
  description:
    "List the files an agent should read before working in a studio, each with why. Points at files; copies nothing.",
  failure: Schema.Union([NotBuilt, UnknownStudio, AdapterFailed]),
  input: Schema.Struct({ studio: studioField }),
  output: PackDef,
});

export const openCheckContract = defineContract("openCheck", {
  description:
    "Open the studio's engine check on an asset's current mix and return a shot and a note.",
  failure: assetFailure,
  input: Schema.Struct({ asset: assetField, studio: studioField }),
  output: CheckShot,
});

export const contracts = [
  listStudiosContract,
  listAssetsContract,
  layersOfContract,
  getAssetContract,
  addVariantsContract,
  renderContract,
  pickContract,
  roundContract,
  getPackContract,
  openCheckContract,
] as const;
