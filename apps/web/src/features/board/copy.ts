export const boardCopy = {
  brand: "Dev studio",
  canvasLabel: (studio: string) => `Node map of the ${studio} studio`,
  fit: "Fit",
  hint: "Drag to pan, wheel to zoom, open a layer to pick",
  noPick: "no pick yet",
  title: (studio: string) => `${studio} studio board`,
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
};

export const pickerCopy = {
  axis: "More along",
  axisPlaceholder: "an axis, such as colour or timing",
  beat: (beat: string) => `held at ${beat}`,
  close: "Close",
  dialog: (layer: string) => `${layer} variants`,
  history: (count: number) =>
    count === 1 ? "1 earlier pick" : `${count} earlier picks`,
  loop: (label: string) => `${label} loop`,
  note: "Pick note",
  notePlaceholder: "what you like about it, or what to keep",
  pick: (label: string) => `Pick ${label}`,
  reference: "Reference",
  roundButton: "Ask for a round",
  roundNote: "Round note",
  still: (label: string, beat: string) => `${label} at the ${beat} beat`,
  sync: (beat: string, period: number) =>
    `Loops restart together; every clip meets at ${beat} (${Math.round(period)} ms cycle)`,
};
