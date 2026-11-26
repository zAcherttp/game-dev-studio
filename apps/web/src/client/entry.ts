import { Runtime } from "foldkit";

import { view } from "../features/home/index.js";
import { Message } from "./motion/message.js";
import { initialModel, Model } from "./motion/model.js";
import { subscriptions } from "./motion/subscriptions.js";
import { update } from "./motion/update.js";

import "../../styles/studio.css";

const application = Runtime.makeApplication({
  Model,
  container: document.querySelector("#root"),
  devTools: import.meta.env.DEV ? { Message } : false,
  init: () => ({ model: initialModel }),
  subscriptions,
  update,
  view,
});

Runtime.hydrate(application);
