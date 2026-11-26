import * as stylex from "@stylexjs/stylex";

import { reader } from "../tokens.stylex.js";

export const homeStyles = stylex.create({
  shell: {
    fontFamily: reader.fontFamily,
    fontSize: reader.fontSize,
    lineHeight: reader.lineHeight,
    marginInline: "auto",
    maxWidth: reader.contentWidth,
    paddingBlock: reader.spaceSection,
    paddingInline: reader.spaceSmall,
  },
});
