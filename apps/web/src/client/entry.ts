import { Runtime } from "foldkit";

import { fireFlags } from "../../test/fixtures/fire-kit.js";
import { view } from "../features/board/index.js";
import { memoryBoardApi } from "./board/api.js";
import { Message } from "./board/message.js";
import { Flags, initialModel, Model } from "./board/model.js";
import { subscriptions } from "./board/subscriptions.js";
import { update } from "./board/update.js";

import "../../styles/studio.css";

const application = Runtime.makeApplication({
  Flags,
  Model,
  container: document.querySelector("#root"),
  devTools: import.meta.env.DEV ? { Message } : false,
  init: (flags) => ({ model: initialModel(flags) }),
  resources: memoryBoardApi(fireFlags.assets),
  subscriptions,
  update,
  view,
});

Runtime.hydrate(application);
