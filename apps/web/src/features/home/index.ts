import * as stylex from "@stylexjs/stylex";
import type { Document, HtmlBuilder } from "foldkit/html";

import type { MotionDemoMessage } from "../../client/motion/message.js";
import type { MotionDemoModel } from "../../client/motion/model.js";
import { view as motionView } from "../motion/index.js";
import { homeCopy } from "./copy.js";
import { homeStyles } from "./home.stylex.js";

export const view = (
  model: MotionDemoModel,
  h: HtmlBuilder<MotionDemoMessage>
): Document => ({
  body: h.main(
    [h.Class(stylex.props(homeStyles.shell).className ?? "")],
    [
      h.h1([], [homeCopy.heading]),
      h.p([], [homeCopy.intro]),
      h.h2([], [homeCopy.motionHeading]),
      motionView(model, h),
    ]
  ),
  title: homeCopy.title,
});
