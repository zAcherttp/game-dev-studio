import { implement } from "@gds/capability/implement";
import {
  addVariantsContract,
  getAssetContract,
  getPackContract,
  listStudiosContract,
  notBuilt,
  openCheckContract,
  pickContract,
  renderContract,
  roundContract,
} from "@gds/model";
import { Effect } from "effect";

export const listStudios = implement(listStudiosContract, () =>
  Effect.fail(notBuilt(listStudiosContract.name))
);

export const getAsset = implement(getAssetContract, () =>
  Effect.fail(notBuilt(getAssetContract.name))
);

export const addVariants = implement(addVariantsContract, () =>
  Effect.fail(notBuilt(addVariantsContract.name))
);

export const render = implement(renderContract, () =>
  Effect.fail(notBuilt(renderContract.name))
);

export const pick = implement(pickContract, () =>
  Effect.fail(notBuilt(pickContract.name))
);

export const round = implement(roundContract, () =>
  Effect.fail(notBuilt(roundContract.name))
);

export const getPack = implement(getPackContract, () =>
  Effect.fail(notBuilt(getPackContract.name))
);

export const openCheck = implement(openCheckContract, () =>
  Effect.fail(notBuilt(openCheckContract.name))
);

export const stubCapabilities = [
  listStudios,
  getAsset,
  addVariants,
  render,
  pick,
  round,
  getPack,
  openCheck,
] as const;
