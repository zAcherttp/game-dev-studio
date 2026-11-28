import { defineContract } from "@gds/capability/contract";
import { Schema } from "effect";

import { AdapterFailed } from "./adapter-failed.js";
import { Asset, AssetSummary, Mix } from "./asset.js";
import { FailsGate } from "./fails-gate.js";
import { LayerBusy } from "./layer-busy.js";
import { NoPick } from "./no-pick.js";
import { NotBuilt } from "./not-built.js";
import { CheckShot, RoundRequest } from "./round.js";
import { StoryReference } from "./story.js";
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
    "Render one variant drawn on top of the mix's other layers, through the studio's renderer. With mix, draw exactly the variant and those layers' takes and leave every other layer out; an empty mix draws the variant alone.",
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
    mix: Schema.optionalKey(
      Mix.annotate({
        description:
          "The other layers to draw with the variant, layer id to take id. Absent: the asset's current mix. Empty: the variant alone.",
      })
    ),
    studio: studioField,
    variant: Schema.String,
  }),
  output: Render,
});

export const pickContract = defineContract("pick", {
  description:
    "Pick one variant for a layer. It replaces that layer's earlier pick in the mix; the history keeps both. No pick while the layer is making, and none of a variant that fails a gate (FailsGate). When the studio applies picks to the game, a failed apply fails the pick and records nothing.",
  failure: Schema.Union([
    NotBuilt,
    UnknownStudio,
    UnknownAsset,
    UnknownLayer,
    UnknownVariant,
    LayerBusy,
    FailsGate,
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

export const renderMixContract = defineContract("renderMix", {
  annotations: { idempotent: true },
  description:
    "Render an asset's whole mix once: every layer's picked variant drawn together, through the studio's renderer.",
  failure: Schema.Union([
    NotBuilt,
    UnknownStudio,
    UnknownAsset,
    UnknownLayer,
    UnknownVariant,
    AdapterFailed,
  ]),
  input: Schema.Struct({ asset: assetField, studio: studioField }),
  output: Render,
});

export const launchContract = defineContract("launch", {
  description:
    "Launch one take of a playable layer. The studio's adapter fills the launch (command, arguments, directory) and starts it, with the take's overrides. Returns the playable render: the launch it ran and, when a replay ran, the replay video in views and the frame strip in numbers.",
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
    take: Schema.String.annotate({
      description: "Take id inside the layer: one of its variants.",
    }),
  }),
  output: Render,
});

export const recordContract = defineContract("record", {
  description:
    "Record a play session's input on an asset and keep it in the asset's records, so every take of the asset replays the same input. Returns the record's id.",
  failure: Schema.Union([NotBuilt, UnknownStudio, UnknownAsset, AdapterFailed]),
  input: Schema.Struct({ asset: assetField, studio: studioField }),
  output: Schema.Struct({
    record: Schema.String.annotate({
      description: "The id of the InputRecord now in the asset's records.",
    }),
  }),
});

export const writeStoryContract = defineContract("writeStory", {
  description:
    "Write a new version of an asset's story block: the owner's words verbatim, references with frame ranges or crops, the sync beat, shared rules, and the layer list the owner said yes to. Earlier versions stay; takes keep the version they answered. Starts the asset when it has no file yet. An agent writes only the owner's own words here and proposes changes as a note instead.",
  failure: Schema.Union([NotBuilt, UnknownStudio, AdapterFailed]),
  input: Schema.Struct({
    asset: assetField,
    beat: Schema.optionalKey(
      Schema.String.annotate({
        description: "The sync beat every take is judged on.",
      })
    ),
    by: Schema.String.annotate({ description: "Whose words these are." }),
    layers: Schema.optionalKey(
      Schema.Array(Schema.String).annotate({
        description:
          "The layer list the owner said yes to, in order. Leave it out until they have.",
      })
    ),
    references: Schema.Array(StoryReference),
    rules: Schema.Array(Schema.String),
    studio: studioField,
    title: Schema.String,
    words: Schema.String.annotate({
      description: "The owner's words for the asset, verbatim.",
    }),
  }),
  output: Asset,
});

export const likeContract = defineContract("like", {
  description:
    "Like a take, or drop an earlier like with keep false. A like keeps the take on the board for later rounds and mixing; it is its own record beside the pick and never changes the mix. Liking what is already liked, or dropping what is not, records nothing.",
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
    by: Schema.String.annotate({ description: "Who liked." }),
    keep: Schema.Boolean.annotate({
      description: "true likes the take; false drops the like.",
    }),
    layer: layerField,
    note: Schema.String,
    studio: studioField,
    variant: Schema.String,
  }),
  output: Asset,
});

export const contracts = [
  listStudiosContract,
  listAssetsContract,
  layersOfContract,
  getAssetContract,
  addVariantsContract,
  renderContract,
  renderMixContract,
  pickContract,
  roundContract,
  getPackContract,
  openCheckContract,
  launchContract,
  recordContract,
  writeStoryContract,
  likeContract,
] as const;
