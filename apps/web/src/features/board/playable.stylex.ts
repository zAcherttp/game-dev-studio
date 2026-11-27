import * as stylex from "@stylexjs/stylex";

const ink = "#e8e8ec";

const muted = "#8b8b97";

const line = "#2c2c35";

const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const playableStyles = stylex.create({
  actions: { display: "flex", flexWrap: "wrap", gap: "6px" },
  strips: {
    borderTopColor: line,
    borderTopStyle: "solid",
    borderTopWidth: "1px",
    display: "grid",
    gap: "6px",
    paddingTop: "10px",
  },
  stripRow: {
    alignItems: "center",
    display: "grid",
    gap: "10px",
    gridTemplateColumns: "96px minmax(0, 1fr)",
  },
  stripLabel: {
    color: muted,
    fontFamily: mono,
    fontSize: "11px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  track: {
    backgroundColor: "#0a0a0c",
    borderRadius: "4px",
    height: "18px",
    overflow: "hidden",
    position: "relative",
  },
  segment: {
    bottom: "3px",
    position: "absolute",
    top: "3px",
  },
  startup: { backgroundColor: "#5b7bd5" },
  active: { backgroundColor: ink },
  recovery: { backgroundColor: "#6b6b78" },
  other: { backgroundColor: line },
  hit: {
    backgroundColor: "#f0a35a",
    bottom: 0,
    position: "absolute",
    top: 0,
    width: "2px",
  },
  sync: {
    borderLeftColor: muted,
    borderLeftStyle: "dashed",
    borderLeftWidth: "1px",
    bottom: 0,
    position: "absolute",
    top: 0,
  },
  cursor: {
    backgroundColor: "#ffffff",
    bottom: 0,
    position: "absolute",
    top: 0,
    width: "2px",
  },
  axis: {
    color: muted,
    display: "flex",
    fontFamily: mono,
    fontSize: "10px",
    justifyContent: "space-between",
  },
  legend: {
    color: muted,
    display: "flex",
    flexWrap: "wrap",
    fontFamily: mono,
    fontSize: "10px",
    gap: "10px",
  },
  swatch: {
    borderRadius: "2px",
    display: "inline-block",
    height: "8px",
    marginInlineEnd: "4px",
    width: "12px",
  },
  launch: {
    color: muted,
    fontFamily: mono,
    fontSize: "10px",
    margin: 0,
    overflowWrap: "anywhere",
  },
});
