import { Runtime } from "foldkit";

import { view } from "../features/board/index.js";
import { Message } from "./board/message.js";
import { Flags, initialModel, Model } from "./board/model.js";
import { rpcBoardApi, STUDIO_RPC_PATH } from "./board/rpc-api.js";
import { subscriptions } from "./board/subscriptions.js";
import { prerenderPicks, update } from "./board/update.js";

import "../../styles/studio.css";

const application = Runtime.makeApplication({
  Flags,
  Model,
  container: document.querySelector("#root"),
  devTools: import.meta.env.DEV ? { Message } : false,
  init: (flags) => {
    const model = initialModel(flags);

    return { commands: prerenderPicks(model), model };
  },
  resources: rpcBoardApi(new URL(STUDIO_RPC_PATH, location.origin).href),
  subscriptions,
  update,
  view,
});

Runtime.hydrate(application);
